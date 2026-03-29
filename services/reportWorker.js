const cron = require('node-cron');
const axios = require('axios');
const mongoose = require('mongoose');
const ReportSchedule = require('../models/ReportSchedule');
const Domain = require('../models/Domain');
const Asset = require('../models/Asset');
const Scan = require('../models/Scan');
const ScanResult = require('../models/ScanResult');
const Cbom = require('../models/Cbom');
const Service = require('../models/Service');
const Recommendation = require('../models/Recommendation');

const generatePdf = require('./generatePdf');
const { sendReportEmail } = require('./emailService');
const { computeDomainSummary } = require('./domainService');
const { toCamel, toSnake } = require("../utils/caseConverter");
const { computeEnvScore, combineScores } = require('../services/scoring');
const deriveMLFeatures = require("../services/mlFeatureExtractor");
const generateScore = require("../services/generateScore");

// --- IMPORTANT: Ensure your HTML Generators are imported or defined below ---
// const { buildAssetsHtml, cbomToHtml, scanResultToHtml } = require('./htmlTemplates');

// ... existing imports (cron, axios, models, caseConverter, scoring) ...

cron.schedule('* * * * *', async () => {
    const now = new Date();
    const currentTime = now.toTimeString().slice(0, 5);

    try {
        const activeSchedules = await ReportSchedule.find({
            time: currentTime,
            isEnabled: true
        }).populate('selectedAssets.assetId');

        for (const schedule of activeSchedules) {
            console.log(`[CRON] 🚀 Starting Deep Audit: ${schedule.scheduleName}`);

            try {
                // --- STEP 1: ASSET PREP & SCAN ---
                const domainId = schedule.targetDomainId;
                const assetIds = schedule.selectedAssets.map(item =>
                    item.assetId?._id || item.assetId
                ).filter(id => id != null);

                if (assetIds.length === 0) continue;

                const dbAssets = await Asset.find({ _id: { $in: assetIds } });
                const services = await Service.find({ assetId: { $in: assetIds } });

                const serviceMap = {};
                services.forEach(s => {
                    const id = s.assetId.toString();
                    if (!serviceMap[id]) serviceMap[id] = [];
                    serviceMap[id].push({ port: s.port, protocol_name: s.protocolName });
                });

                const scannerAssets = dbAssets.map(a => ({
                    host: a.host,
                    ip: a.ip,
                    services: serviceMap[a._id.toString()] || []
                }));

                // Call Scanner
                const scanRecord = await Scan.create({ domainId, scanType: "deep", assets: assetIds, status: "pending", startedAt: new Date() });
                const scannerResponse = await axios.post("http://localhost:8000/scan", { assets: scannerAssets, scan_type: "soft" });

                // --- STEP 2: SCORING & INSERTION ---
                const resultsToInsert = [];
                const assetLookup = {};
                dbAssets.forEach(a => { assetLookup[a.host] = a._id; });

                for (const raw of scannerResponse.data.results) {
                    const assetId = assetLookup[raw.host];
                    const entry = schedule.selectedAssets.find(sa => (sa.assetId?._id || sa.assetId).toString() === assetId.toString());
                    const bContext = entry?.businessContext || { assetCriticality: 5, confidentialityWeight: 5, integrityWeight: 5, availabilityWeight: 5, slaRequirement: 5, remediationDifficulty: 5, dependentServices: 0 };

                    const camelRaw = toCamel(raw);
                    let mlScore = 0;
                    if (camelRaw.status === "success") {
                        try {
                            const features = deriveMLFeatures(camelRaw);
                            const mlRes = await axios.post("http://localhost:9000/pqc-score", { features });
                            mlScore = await generateScore(mlRes.data.scores[0], camelRaw);
                        } catch (e) { console.error("Scoring failed"); }
                    }

                    resultsToInsert.push({
                        scanId: scanRecord._id,
                        assetId,
                        ...camelRaw,
                        pqcReadyScore: combineScores(mlScore, computeEnvScore(bContext)),
                        mlScore,
                        envScore: computeEnvScore(bContext),
                        businessContext: bContext
                    });
                }

                await ScanResult.insertMany(resultsToInsert);
                scanRecord.status = "completed";
                scanRecord.completedAt = new Date();
                await scanRecord.save();

                // ==========================================
                // 🔥 STEP 3: CORRECTED CBOM GENERATION
                // ==========================================

                // 1. Fetch from DB (Ensures we have the full structure including Mongoose virtuals/objects)
                const scanResults = await ScanResult.find({ scanId: scanRecord._id }).populate("assetId");

                // 2. Map to Snake Case (Matching your router logic exactly)
                const snakeScanResults = scanResults.map(r => {
                    const plain = r.toObject();
                    return toSnake({
                        host: r.assetId?.host || r.host,
                        ip: r.assetId?.ip || r.ip,
                        port: r.port,
                        protocol: r.protocol,
                        status: r.status,
                        failure_reason: r.failureReason,
                        negotiated: plain.negotiated,
                        supported: plain.supported,
                        pqc: plain.pqc,
                        certificate: plain.certificate,
                        weak_ciphers: plain.weakCiphers,
                        pfs_supported: plain.pfsSupported,
                        vulnerabilities: plain.vulnerabilities
                    });
                });

                // 3. Call FastAPI with actual data
                const cbomRes = await axios.post("http://localhost:8000/cbom", {
                    results: snakeScanResults,
                    mode: "per_asset" // Using per_asset for detailed data mapping
                });

                const cbomData = toCamel(cbomRes.data);
                const rawAssets = cbomData.cbom.assets || [];

                // 4. Manual Flattening Logic (From your provided code)
                let algorithms = [], keys = [], protocols = [], certificates = [];
                const assets = rawAssets.map(a => a.asset);

                rawAssets.forEach(a => {
                    const host = a.asset;
                    if (a.algorithms) a.algorithms.forEach(algo => algorithms.push({ ...algo, asset: host }));
                    if (a.keys) a.keys.forEach(k => keys.push({ ...k, asset: host }));
                    if (a.protocols) a.protocols.forEach(p => protocols.push({ ...p, asset: host }));
                    if (a.certificates) a.certificates.forEach(c => certificates.push({ ...c, asset: c.asset || host }));
                });

                const finalCbom = await Cbom.create({
                    scanId: scanRecord._id,
                    mode: "per_asset",
                    assets,
                    failedAssets: cbomData.cbom.failedAssets || [],
                    algorithms,
                    keys,
                    protocols,
                    certificates
                });

                // ==========================================
                // --- STEP 4: PDF & EMAIL DELIVERY ---
                // ==========================================
                let attachments = [];
                const domainDoc = await Domain.findById(domainId).lean();
                const dName = domainDoc?.domainName.replace(/\./g, '_') || 'audit';

                if (schedule.includeSections.assets) {
                    const assets = await Asset.find({domainId}).lean();
                    const enriched = await Promise.all(assets.map(async (a) => {
                        const services = await Service.find({ assetId: a._id }).lean();
                        return { ...a, services };
                    }));
                    if (enriched.length > 0) {
                        const html = buildAssetsHtml(enriched, schedule.scheduleName);
                        attachments.push({ filename: `${dName}_Assets.pdf`, content: await generatePdf(html) });
                    }
                }

                if (schedule.includeSections.cboms) {
                    attachments.push({ filename: `${dName}_CBOM.pdf`, content: await generatePdf(cbomToHtml(finalCbom)) });
                }

                if (schedule.includeSections.scanResults) {
                    const summary = await computeDomainSummary(domainId);
                    const freshResults = await ScanResult.find({ scanId: scanRecord._id }).populate("assetId").lean();
                    const recommendations = await Recommendation.find({ scanResultId: { $in: freshResults.map(r => r._id) } }).lean();
                    const cryptoInventory = [...new Set(freshResults.map(r => r.negotiated?.cipher).filter(Boolean))];

                    attachments.push({
                        filename: `${dName}_Posture.pdf`,
                        content: await generatePdf(scanResultToHtml(summary, cryptoInventory, freshResults, recommendations, schedule.scheduleName))
                    });
                }

                await sendReportEmail(schedule.email, schedule.scheduleName, attachments);
                console.log(`[CRON] ✅ Full Report delivered to ${schedule.email}`);

            } catch (err) { console.error(`[CRON] Error in ${schedule.scheduleName}:`, err); }
        }
    } catch (err) { console.error("[CRON] Global failure:", err); }
});

// --- HTML GENERATORS (One for each PDF Type) ---

/**
 * @function buildAssetsHtml
 * @description Renders the Asset Inventory Topography for the PDF.
 */
function buildAssetsHtml(assets, scheduleName) {
    const totalAssets = assets.length;
    const timestamp = new Date().toLocaleString('en-GB');

    // Generate table rows for the assets
    const assetRows = assets.map(asset => {
        // Map the services into small visual badges matching your React UI
        const serviceBadges = (asset.services || []).map(s => `
            <span style="display: inline-block; background: #0f172a; color: #60a5fa; font-size: 8px; font-family: monospace; font-weight: 800; padding: 2px 6px; border-radius: 4px; margin-right: 4px; margin-bottom: 4px; border: 1px solid rgba(96, 165, 250, 0.2);">
                ${s.protocolName || 'TCP'}:${s.port}
            </span>
        `).join('');

        return `
        <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 20px 15px; vertical-align: top;">
                <div style="font-weight: 800; color: #0f172a; font-size: 13px; text-transform: uppercase; italic;">${asset.host}</div>
                <div style="color: #94a3b8; font-size: 10px; font-family: monospace; margin-top: 4px; font-weight: 700;">${asset.ip}</div>
            </td>
            <td style="padding: 20px 15px; vertical-align: top;">
                <span style="font-size: 10px; font-weight: 900; color: #2563eb; text-transform: uppercase; background: #eff6ff; padding: 4px 8px; border-radius: 8px;">
                    ${asset.assetType || 'Compute Node'}
                </span>
            </td>
            <td style="padding: 20px 15px; text-align: left; vertical-align: top; max-width: 250px;">
                <div style="font-size: 8px; font-weight: 900; color: #94a3b8; text-transform: uppercase; margin-bottom: 8px; letter-spacing: 1px;">
                    Active Service Topography (${asset.services?.length || 0})
                </div>
                <div style="display: flex; flex-wrap: wrap;">
                    ${serviceBadges || '<span style="color: #cbd5e1; font-size: 9px; font-style: italic;">No active services</span>'}
                </div>
            </td>
        </tr>
    `}).join('');

    return `
    <!DOCTYPE html>
    <html>
    <head>
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
            body { font-family: sans-serif; padding: 40px; background: #fff; color: #1e293b; }
            .header-accent { border-left: 10px solid #0f172a; padding-left: 20px; }
            table { width: 100%; border-collapse: separate; border-spacing: 0; margin-top: 20px; }
            th { background: #0f172a; color: #fff; text-align: left; padding: 15px; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; }
        </style>
    </head>
    <body>
        <div class="flex justify-between items-start mb-12">
            <div class="header-accent">
                <h1 style="font-size: 28px; font-weight: 900; text-transform: uppercase; font-style: italic; color: #0f172a; line-height: 1;">
                    Global Asset Inventory
                </h1>
                <p style="font-size: 10px; font-weight: 800; color: #94a3b8; text-transform: uppercase; letter-spacing: 3px; margin-top: 10px;">
                    Network Endpoint Discovery Audit
                </p>
            </div>
            <div style="text-align: right;">
                <div style="background: #eff6ff; color: #2563eb; padding: 6px 12px; border-radius: 10px; font-size: 10px; font-weight: 900; text-transform: uppercase; display: inline-block;">
                    Ref: ${scheduleName}
                </div>
                <p style="font-size: 9px; color: #64748b; margin-top: 8px; font-weight: 700;">TIMESTAMP: ${timestamp}</p>
            </div>
        </div>

        <div style="background: #f8fafc; border-radius: 30px; padding: 35px; margin-bottom: 40px; border: 1px solid #f1f5f9; display: flex; gap: 60px;">
            <div>
                <p style="font-size: 9px; font-weight: 900; color: #94a3b8; text-transform: uppercase; margin-bottom: 8px; letter-spacing: 1px;">Total Detected Nodes</p>
                <p style="font-size: 40px; font-weight: 900; color: #0f172a; line-height: 1;">${totalAssets}</p>
            </div>
            <div style="border-left: 2px solid #e2e8f0; padding-left: 40px;">
                <p style="font-size: 9px; font-weight: 900; color: #94a3b8; text-transform: uppercase; margin-bottom: 8px; letter-spacing: 1px;">Discovery Status</p>
                <p style="font-size: 16px; font-weight: 900; color: #10b981; text-transform: uppercase; display: flex; align-items: center; gap: 5px;">
                    ● Verified Active
                </p>
            </div>
        </div>

        <table>
            <thead>
                <tr>
                    <th style="border-radius: 15px 0 0 0;">Host / Endpoint</th>
                    <th>Classification</th>
                    <th style="border-radius: 0 15px 0 0;">Active Services</th>
                </tr>
            </thead>
            <tbody>
                ${assetRows}
            </tbody>
        </table>

        <div style="margin-top: 60px; text-align: center; border-top: 2px solid #f1f5f9; padding-top: 30px;">
            <p style="font-size: 10px; font-weight: 900; color: #cbd5e1; text-transform: uppercase; letter-spacing: 8px;">
                End of Infrastructure Topography Report
            </p>
        </div>
    </body>
    </html>
    `;
}

/**
 * @function cbomToHtml
 * @description Renders the complete CBOM Registry including Algorithms, Keys, Protocols, and Certificates.
 */
const cbomToHtml = (cbom) => {
    const timestamp = new Date().toLocaleString('en-GB');

    // --- 1. Algorithm Table (Detailed) ---
    const algoRows = (cbom.algorithms || []).map(item => `
        <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 12px; font-weight: 800; color: #ea580c; font-size: 10px; text-transform: uppercase;">${item.name || "null"}</td>
            <td style="padding: 12px; font-size: 10px;">${item.assetType || "null"}</td>
            <td style="padding: 12px; font-size: 10px;">${item.primitive || "null"}</td>
            <td style="padding: 12px; font-size: 10px;">${item.mode || "null"}</td>
            <td style="padding: 12px; font-size: 10px; font-weight: bold;">${item.classicalSecurityLevel} Bits</td>
            <td style="padding: 12px; font-size: 9px; font-family: monospace; color: #94a3b8;">${item.oid || "N/A"}</td>
        </tr>
    `).join('');

    // --- 2. Keys Table (Added Activation & ID) ---
    const keyRows = (cbom.keys || []).map(item => `
        <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 12px; font-weight: 800; color: #0f172a; font-size: 10px;">${item.name || "null"}</td>
            <td style="padding: 12px; font-size: 10px;">${item.size} Bits</td>
            <td style="padding: 12px; font-size: 10px;"><span style="background:#f1f5f9; padding:2px 6px; border-radius:4px;">${item.state}</span></td>
            <td style="padding: 12px; font-size: 9px; color: #64748b;">Created: ${item.creationDate || "null"}</td>
            <td style="padding: 12px; font-size: 9px; color: #ea580c; font-weight: bold;">Active: ${item.activationDate || "null"}</td>
            <td style="padding: 12px; font-size: 8px; font-family: monospace; color: #94a3b8;">ID: ${item.id || "null"}</td>
        </tr>
    `).join('');

    // --- 3. Protocols Table (Added ALPN & Nested Cipher Suites) ---
    const protocolRows = (cbom.protocols || []).map(item => `
        <tr style="background: #f8fafc;">
            <td style="padding: 12px; font-weight: 800; color: #2563eb; font-size: 11px; text-transform: uppercase;">${item.name || "null"}</td>
            <td style="padding: 12px; font-size: 10px; font-weight: bold;">${Array.isArray(item.version) ? item.version.join(', ') : item.version}</td>
            <td style="padding: 12px; font-size: 10px; color: #ea580c; font-weight: 900;">ALPN: ${item.alpn || "N/A"}</td>
            <td style="padding: 12px; font-size: 9px; font-family: monospace; text-align: right;">${item.oid || "N/A"}</td>
        </tr>
        <tr>
            <td colspan="4" style="padding: 0 12px 12px 12px; border-bottom: 1px solid #f1f5f9;">
                <div style="font-size: 8px; color: #94a3b8; margin-bottom: 5px; text-transform: uppercase; font-weight: 900;">Cipher Suites:</div>
                <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                    ${(item.cipherSuites || []).map(suite => `
                        <span style="background: #f1f5f9; color: #475569; padding: 2px 5px; border-radius: 4px; border: 1px solid #e2e8f0; font-family: monospace;">${suite}</span>
                    `).join('') || '<span style="color: #cbd5e1;">None detected</span>'}
                </div>
            </td>
        </tr>
    `).join('');

    // --- 4. Deep Certificate Chains (Full UI Data) ---
    const certBlocks = (cbom.certificates || []).map(cert => `
        <div style="margin-bottom: 35px; border: 2px solid #f1f5f9; border-radius: 25px; overflow: hidden; page-break-inside: avoid; background: #fff; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.05);">
            <div style="background: #0f172a; color: white; padding: 20px 25px; display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <h3 style="margin: 0; font-size: 16px; font-weight: 900; text-transform: uppercase; letter-spacing: -0.5px;">${cert.asset}</h3>
                    <p style="margin: 5px 0 0 0; font-size: 9px; color: #ea580c; font-family: monospace; font-weight: bold;">FORMAT: ${cert.leafCertificate?.certificateFormat}</p>
                </div>
                <div style="text-align: right;">
                    <p style="margin: 0; font-size: 8px; color: #94a3b8; text-transform: uppercase; font-weight: 900;">SHA256 Fingerprint</p>
                    <p style="margin: 2px 0 0 0; font-size: 8px; font-family: monospace; color: #f1f5f9; background: rgba(255,255,255,0.05); padding: 3px 8px; border-radius: 5px;">${cert.leafCertificate?.fingerprintSha256}</p>
                </div>
            </div>
            
            <div style="padding: 25px; display: flex; gap: 30px;">
                <div style="flex: 1.2; space-y: 15px;">
                    <div style="margin-bottom: 15px;">
                        <p style="font-size: 8px; font-weight: 900; color: #94a3b8; text-transform: uppercase; margin-bottom: 4px;">Subject Common Name</p>
                        <p style="font-size: 11px; font-weight: 800; color: #1e293b; line-height: 1.3;">${cert.leafCertificate?.subjectName}</p>
                    </div>
                    <div style="margin-bottom: 15px;">
                        <p style="font-size: 8px; font-weight: 900; color: #94a3b8; text-transform: uppercase; margin-bottom: 4px;">Issuer</p>
                        <p style="font-size: 10px; font-weight: 700; color: #64748b;">${cert.leafCertificate?.issuerName}</p>
                    </div>
                    <div style="display: flex; gap: 20px; border-top: 1px solid #f1f5f9; padding-top: 15px;">
                        <div>
                            <p style="font-size: 8px; font-weight: 900; color: #94a3b8; text-transform: uppercase; margin-bottom: 4px;">Validity Start</p>
                            <p style="font-size: 10px; font-weight: 700; color: #1e293b;">${cert.leafCertificate?.validityPeriod?.notBefore}</p>
                        </div>
                        <div>
                            <p style="font-size: 8px; font-weight: 900; color: #ef4444; text-transform: uppercase; margin-bottom: 4px;">Validity Expiry</p>
                            <p style="font-size: 10px; font-weight: 900; color: #ef4444;">${cert.leafCertificate?.validityPeriod?.notAfter}</p>
                        </div>
                    </div>
                    <div style="margin-top: 15px; background: #f8fafc; padding: 12px; border-radius: 12px;">
                        <p style="font-size: 8px; font-weight: 900; color: #475569; text-transform: uppercase; margin-bottom: 5px;">Public Key Reference</p>
                        <p style="font-size: 9px; font-family: monospace; color: #2563eb; word-break: break-all;">${cert.leafCertificate?.subjectPublicKeyReference}</p>
                    </div>
                </div>

                <div style="flex: 1; border-left: 2px solid #f8fafc; padding-left: 25px;">
                    <p style="font-size: 9px; font-weight: 900; color: #0f172a; text-transform: uppercase; margin-bottom: 12px; display: flex; align-items: center; gap: 5px;">
                        <span style="color: #ea580c;">🔗</span> Trust Chain Hierarchy
                    </p>
                    <div style="border-left: 2px solid #ea580c; padding-left: 15px;">
                        ${(cert.certificateChain || []).map(node => `
                            <div style="margin-bottom: 12px; position: relative;">
                                <div style="position: absolute; left: -21px; top: 5px; width: 10px; height: 10px; background: #ea580c; border: 2px solid #fff; border-radius: 50%;"></div>
                                <p style="font-size: 9px; font-weight: 800; color: #334155; margin: 0; line-height: 1.2;">${node.subject}</p>
                                <p style="font-size: 7px; color: #94a3b8; margin: 2px 0 0 0;">Fingerprint: ${node.fingerprintSha256?.substring(0, 20)}...</p>
                            </div>
                        `).join('')}
                    </div>
                    <div style="margin-top: 20px; padding-top: 15px; border-top: 1px solid #f1f5f9;">
                         <p style="font-size: 8px; font-weight: 900; color: #94a3b8; text-transform: uppercase; margin-bottom: 8px;">Certificate Extensions</p>
                         <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                             ${(cert.leafCertificate?.certificateExtension?.keyUsage || []).map(u => `
                                 <span style="font-size: 7px; background: #eff6ff; color: #1e40af; padding: 2px 6px; border-radius: 4px; font-weight: 900; text-transform: uppercase;">${u}</span>
                             `).join('')}
                         </div>
                    </div>
                </div>
            </div>
        </div>
    `).join('');

    return `
    <!DOCTYPE html>
    <html>
    <head>
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
            body { font-family: sans-serif; padding: 35px; background: #fff; color: #1e293b; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 35px; table-layout: fixed; }
            .section-label { font-size: 13px; font-weight: 900; color: #ea580c; text-transform: uppercase; border-bottom: 3px solid #ea580c; padding-bottom: 6px; margin-bottom: 20px; letter-spacing: 1px; }
            th { padding: 12px; font-size: 10px; text-transform: uppercase; color: #64748b; background: #f8fafc; text-align: left; }
            td { word-wrap: break-word; }
            .header-strip { border-left: 10px solid #0f172a; padding-left: 20px; }
        </style>
    </head>
    <body>
        <div class="flex justify-between items-start mb-12">
            <div class="header-strip">
                <h1 style="font-size: 26px; font-weight: 900; text-transform: uppercase; font-style: italic; color: #0f172a; line-height: 1;">CBOM Strategic Registry</h1>
                <p style="font-size: 10px; font-weight: 800; color: #94a3b8; text-transform: uppercase; letter-spacing: 3px; margin-top: 8px;">Post-Quantum Cryptography Audit • 2026</p>
            </div>
            <div style="text-align: right;">
                <p style="font-size: 11px; font-weight: 900; color: #ea580c; background: #fff7ed; padding: 5px 12px; border-radius: 10px; display: inline-block;">MODE: ${cbom.mode?.toUpperCase()}</p>
                <p style="font-size: 9px; color: #64748b; margin-top: 8px; font-weight: bold;">TIMESTAMP: ${timestamp}</p>
            </div>
        </div>

        <div class="section-label">01. Cryptographic Algorithms</div>
        <table>
            <thead><tr><th style="width:25%">Algorithm</th><th style="width:20%">Asset</th><th style="width:15%">Primitive</th><th style="width:15%">Mode</th><th style="width:10%">Security</th><th style="width:15%">OID</th></tr></thead>
            <tbody>${algoRows}</tbody>
        </table>

        <div class="section-label">02. Active Key Inventory</div>
        <table>
            <thead><tr><th style="width:25%">Identifier</th><th style="width:15%">Size</th><th style="width:15%">State</th><th style="width:20%">Lifecycle</th><th style="width:25%">Metadata</th></tr></thead>
            <tbody>${keyRows}</tbody>
        </table>

        <div class="section-label">03. Transport Protocols & Cipher Suites</div>
        <table style="border-radius: 15px; overflow: hidden;">
            <tbody>${protocolRows}</tbody>
        </table>

        <div class="section-label" style="margin-top: 45px;">04. Public Key Infrastructure (PKI) Certificates</div>
        ${certBlocks}

        <div style="margin-top: 60px; text-align: center; border-top: 2px solid #f1f5f9; padding-top: 30px;">
            <p style="font-size: 10px; font-weight: 900; color: #cbd5e1; text-transform: uppercase; letter-spacing: 6px;">End of Comprehensive Strategic Archive</p>
        </div>
    </body>
    </html>
    `;
};

/**
 * @function scanResultToHtml
 * @description Renders the PQC Posture report including ML Scores, Business Context, and AI Recommendations.
 */
/**
 * @function scanResultToHtml
 * @description Renders the complete PQC Posture report including Strategic Summary, 
 * Cipher footprint wall, and Tactical Node breakdowns.
 */
const scanResultToHtml = (domainSummary, cryptoInventory, scanResults, assetPlans, scheduleName) => {
    const timestamp = new Date().toLocaleString('en-GB');

    // Replicating React getClassification logic for the PDF
    const getClassification = (score) => {
        const s = score * 1000;
        if (s >= 900) return { label: "Quantum Safe", color: "#10b981", bg: "#ecfdf5" };
        if (s >= 700) return { label: "PQC Ready", color: "#3b82f6", bg: "#eff6ff" };
        if (s >= 400) return { label: "Migration Required", color: "#f59e0b", bg: "#fffbeb" };
        return { label: "Quantum Vulnerable", color: "#ef4444", bg: "#fef2f2" };
    };

    // --- Generate Cipher footprint wall ---
    const cipherWall = (cryptoInventory || []).map(alg => `
        <div style="display:inline-block; margin:2px; padding:4px 10px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; font-size:8px; font-weight:800; color:#475569; text-transform:uppercase;">
            ${alg}
        </div>
    `).join('');

    // --- Generate Tactical Node Cards ---
    const nodeCards = scanResults.map(res => {
        const config = getClassification(res.pqcReadyScore || 0);
        const matchingPlan = assetPlans.find(p => p.scanResultId.toString() === res._id.toString());

        return `
        <div style="border: 2px solid #f1f5f9; border-radius: 30px; margin-bottom: 25px; page-break-inside: avoid; background:#fff;">
            <div style="padding: 20px; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center;">
                <div style="display:flex; align-items:center; gap:10px;">
                    <div style="width:12px; height:12px; border-radius:50%; background:${config.color};"></div>
                    <div>
                        <h4 style="margin:0; font-size:14px; font-weight:900;">${res.assetId?.host || res.host}</h4>
                        <p style="margin:2px 0 0 0; font-size:9px; color:#94a3b8; font-family:monospace;">${res.assetId?.ip || '0.0.0.0'} • PORT ${res.port}</p>
                    </div>
                </div>
                <div style="text-align:right;">
                    <p style="margin:0; font-size:18px; font-weight:900; color:#0f172a;">${Math.round(res.pqcReadyScore * 1000)}</p>
                    <p style="margin:0; font-size:7px; font-weight:900; color:${config.color}; text-transform:uppercase;">${config.label}</p>
                </div>
            </div>

            <div style="padding: 20px; display: flex; gap: 20px;">
                <div style="flex: 1; background: #f8fafc; border-radius: 20px; padding: 15px;">
                    <p style="font-size:8px; font-weight:900; color:#94a3b8; text-transform:uppercase; margin-bottom:10px;">Node Handshake</p>
                    <div style="font-size:9px; space-y:5px;">
                        <p style="margin:3px 0;"><b>TLS:</b> ${res.negotiated?.tlsVersion || 'N/A'}</p>
                        <p style="margin:3px 0;"><b>KEX:</b> ${res.negotiated?.keyExchange || 'N/A'}</p>
                        <p style="margin:3px 0; word-break:break-all;"><b>Cipher:</b> <span style="font-size:8px; font-family:monospace;">${res.negotiated?.cipher}</span></p>
                        <p style="margin:3px 0;"><b>PFS:</b> ${res.pfsSupported ? 'YES' : 'NO'}</p>
                    </div>
                </div>

                <div style="flex: 1.5; border-left: 2px solid #f1f5f9; padding-left: 20px;">
                    <p style="font-size:8px; font-weight:900; color:#ea580c; text-transform:uppercase; margin-bottom:10px;">Neural Migration Strategy</p>
                    <p style="font-size:10px; font-weight:700; color:#334155; line-height:1.4; font-style:italic;">
                        "${matchingPlan?.recommendations || 'Neural analysis pending...'}"
                    </p>
                    <div style="margin-top:10px; display:flex; gap:5px;">
                        <span style="background:#0f172a; color:#fff; font-size:7px; padding:3px 8px; border-radius:5px;">KEX: ${matchingPlan?.recommendedPqcKex || 'N/A'}</span>
                        <span style="background:#ea580c; color:#fff; font-size:7px; padding:3px 8px; border-radius:5px;">SIG: ${matchingPlan?.recommendedPqcSignature || 'N/A'}</span>
                    </div>
                </div>
            </div>
        </div>
        `;
    }).join('');

    return `
    <!DOCTYPE html>
    <html>
    <head>
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
            body { font-family: sans-serif; padding: 35px; background: #fff; color: #0f172a; }
            .strategic-card { background: #0f172a; border-radius: 40px; padding: 40px; color: #fff; margin-bottom: 40px; }
            .badge-container { background: #f8fafc; border: 1px solid #f1f5f9; border-radius: 25px; padding: 20px; margin-bottom: 40px; }
        </style>
    </head>
    <body>
        <div class="flex justify-between items-start mb-10">
            <div>
                <h1 style="font-size:24px; font-weight:900; text-transform:uppercase; font-style:italic; line-height:1;">PQC Posture Analysis</h1>
                <p style="font-size:10px; font-weight:800; color:#94a3b8; text-transform:uppercase; letter-spacing:3px; margin-top:8px;">Strategic Audit • ${scheduleName}</p>
            </div>
            <p style="font-size:9px; color:#64748b; font-weight:bold;">${timestamp}</p>
        </div>

        <div class="strategic-card">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px;">
                <div>
                    <span style="background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); padding: 5px 15px; border-radius: 20px; font-size: 10px; font-weight: 900; text-transform: uppercase;">
                        THREAT LEVEL: ${domainSummary.recommendation?.riskLevel || 'HIGH'}
                    </span>
                    <h2 style="font-size: 60px; font-weight: 900; margin: 15px 0 5px 0;">Grade: <span style="color: #10b981;">${Math.round(domainSummary.pqcReadiness?.averageScore * 1000)}</span></h2>
                    <p style="font-size:10px; color:#94a3b8; font-weight:800; text-transform:uppercase;">Domain Coverage: ${domainSummary.assets?.scannedAssets} / ${domainSummary.assets?.totalAssets} Nodes</p>
                </div>
            </div>
            <p style="font-size: 12px; color: #cbd5e1; font-weight: 600; line-height: 1.6; border-left: 3px solid #ea580c; padding-left: 20px;">
                ${domainSummary.recommendation?.summary || 'Scanning complete. Strategic recommendations generated.'}
            </p>
        </div>

        <h3 style="font-size:12px; font-weight:900; text-transform:uppercase; color:#64748b; margin-bottom:15px; letter-spacing:2px;">Unique Cipher Footprint</h3>
        <div class="badge-container">
            ${cipherWall || '<p style="font-size:9px; color:#cbd5e1;">No primitives detected.</p>'}
        </div>

        <h3 style="font-size:12px; font-weight:900; text-transform:uppercase; color:#64748b; margin-bottom:20px; letter-spacing:2px;">Node Breakdown (${scanResults.length} Assets)</h3>
        ${nodeCards}

        <div style="margin-top: 60px; text-align: center; border-top: 1px solid #f1f5f9; padding-top: 30px;">
            <p style="font-size: 10px; font-weight: 900; color: #cbd5e1; text-transform: uppercase; letter-spacing: 5px;">End of Strategic Posture Report</p>
        </div>
    </body>
    </html>
    `;
};