const express = require("express");
const router = express.Router();
const authMiddleware = require("../middlewares/authMiddleware");
const puppeteer = require('puppeteer');

const Domain = require("../models/Domain");
const Asset = require("../models/Asset");
const ScanResult = require("../models/ScanResult");
const ReportSchedule = require("../models/ReportSchedule");
const generatePdf = require("../services/generatePdf");
const { processAndSendReport } = require("../services/reportEngine");

// Apply authentication
router.use(authMiddleware);

/**
 * @route GET /api/reports/executive-summary
 * @description Generates a strategic HUD dataset for executive-level oversight.
 * Maps raw technical data into Compliance Tiers and Quantum Readiness Indices.
 */
router.get("/executive-summary", async (req, res) => {
    try {
        // 1. Discovery Data
        const totalAssets = await Asset.countDocuments();
        const totalDomains = await Domain.countDocuments();
        const cloudAssets = await Asset.countDocuments({
            assetType: { $regex: /cloud|aws|azure|gcp/i }
        });

        // 2. Scan & PQC Aggregation
        const scans = await ScanResult.find({ status: "success" });
        const totalScanned = scans.length;

        // Calculate Average PQC Posture (Primary Metric)
        const avgPqcScore = totalScanned > 0
            ? (scans.reduce((acc, s) => acc + (s.pqcReadyScore || 0), 0) / totalScanned) * 100
            : 0;

        // Calculate Hybrid Adoption (Secondary Metric)
        // Checks if negotiated PQC array contains hybrid algorithms
        const hybridCount = scans.filter(s =>
            s.pqc?.negotiated?.some(algo => algo.toLowerCase().includes('hybrid'))
        ).length;
        const pqcHybridPosture = totalScanned > 0 ? (hybridCount / totalScanned) * 100 : 0;

        // 3. CBOM / Vulnerability Aggregation
        // Summing up the length of the vulnerabilities array across all assets
        const totalVulnerabilities = scans.reduce((acc, s) => acc + (s.vulnerabilities?.length || 0), 0);

        // 4. Cyber Rating Logic (Dynamic Tier Assignment)
        let rating = "Tier 4 Needs Improvement";
        if (avgPqcScore >= 90) rating = "Tier 1 Excellent";
        else if (avgPqcScore >= 70) rating = "Tier 2 Good";
        else if (avgPqcScore >= 40) rating = "Tier 3 Satisfactory";

        // 5. Inventory Breakdown (Specific to Executive HUD)
        const tlsCertCount = await Asset.countDocuments({
            $or: [
                { assetType: { $regex: /web|app|interface|api/i } }, // Types that usually have TLS
                { port: 443 },                                      // Assets explicitly identified on TLS port
                { "metadata.port": 443 }                            // Checking nested metadata if you use it
            ]
        });
        const softwareNodes = await Asset.countDocuments({
            assetType: { $regex: /server|host|compute/i }
        });
        const activeApis = await Asset.countDocuments({
            assetType: { $regex: /api/i }
        });
        const webApps = await Asset.countDocuments({
            assetType: { $regex: /web|app|interface/i }
        });

        // 6. Final JSON Response (Strictly matching your Frontend HUD components)
        res.json({
            discovery: {
                totalDomains,
                totalAssets,
                cloudAssets
            },
            cyberRating: rating,
            pqcPosture: Math.round(avgPqcScore),
            pqcHybridPosture: Math.round(pqcHybridPosture),
            totalVulnerabilities,
            inventory: {
                tls: tlsCertCount,
                software: softwareNodes,
                apis: activeApis,
                logins: webApps
            },
            // Metadata for report generation
            generatedAt: new Date(),
            scope: "Enterprise-Wide Cryptographic Audit"
        });

    } catch (err) {
        console.error("Executive Reporting Aggregation Error:", err);
        res.status(500).json({ error: "Failed to generate executive report data." });
    }
});

/**
 * @route GET /api/reports/executive-download
 * @description Renders the Executive HUD using Puppeteer and streams the PDF.
 */
// backend/routes/reportRoutes.js
router.get('/executive-download', async (req, res) => {
    try {
        // 1. Fetch Dynamic Data (Same as your HUD)
        const totalAssets = await Asset.countDocuments();
        const domains = await Domain.countDocuments();
        const scans = await ScanResult.find({ status: 'success' });

        const avgPqc = scans.length > 0
            ? Math.round((scans.reduce((acc, s) => acc + (s.pqcReadyScore || 0), 0) / scans.length) * 100)
            : 0;

        const totalVulnerabilities = scans.reduce((acc, s) => acc + (s.vulnerabilities?.length || 0), 0);

        const inventory = {
            tls: await ScanResult.countDocuments({ status: 'success', port: 443 }),
            software: await Asset.countDocuments({ assetType: { $regex: /server/i } }),
            apis: await Asset.countDocuments({ assetType: { $regex: /api/i } }),
            logins: await Asset.countDocuments({ assetType: { $regex: /web/i } })
        };

        // Calculate which Tier is active for the PDF
        const getTier = (score) => {
            if (score >= 90) return 'Tier 1 Excellent';
            if (score >= 70) return 'Tier 2 Good';
            if (score >= 40) return 'Tier 3 Satisfactory';
            return 'Tier 4 Needs Improvement';
        };
        const activeTier = getTier(avgPqc);

        const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <script src="https://cdn.tailwindcss.com"></script>
            <style>
                body { font-family: sans-serif; background: white; padding: 40px; }
                .card { border: 1px solid #e2e8f0; border-radius: 2.5rem; padding: 30px; }
                .hud-dark { background: #0f172a; color: white; border-radius: 2.5rem; padding: 40px; }
                .tier-active { background: #ecfdf5; border: 1px solid #10b981; }
                .tier-inactive { opacity: 0.3; }
            </style>
        </head>
        <body class="space-y-8">
            <div class="flex justify-between items-center border-b-4 border-slate-900 pb-6 mb-10">
                <div>
                    <h1 class="text-3xl font-black uppercase italic text-slate-900">Strategic PQC Audit Report</h1>
                    <p class="text-slate-500 font-bold uppercase text-xs tracking-widest mt-2">PNB Hackathon 2026 — Executive Summary</p>
                </div>
                <div class="text-right">
                    <p class="text-[10px] font-black text-slate-400 uppercase">Generated On</p>
                    <p class="text-sm font-bold">${new Date().toLocaleDateString('en-GB')}</p>
                </div>
            </div>

            <div class="grid grid-cols-3 gap-6">
                <div class="card">
                    <h3 class="text-orange-500 font-black uppercase text-[10px] tracking-widest mb-4">Assets Discovery</h3>
                    <p class="text-4xl font-black text-slate-900">${(totalAssets + domains).toLocaleString()}</p>
                    <p class="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Infrastructure Footprint</p>
                </div>

                <div class="card">
                    <h3 class="text-emerald-500 font-black uppercase text-[10px] tracking-widest mb-4">Cyber Rating</h3>
                    <div class="space-y-1">
                        ${['Excellent', 'Good', 'Satisfactory', 'Needs Improvement'].map((t, i) => `
                            <div class="flex items-center gap-2 p-1 rounded-lg ${activeTier.includes(t) ? 'tier-active' : 'tier-inactive'}">
                                <span class="bg-slate-200 text-[8px] font-black px-1.5 py-0.5 rounded">${String.fromCharCode(65 + i)}</span>
                                <span class="text-[9px] font-black uppercase">${t}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <div class="card">
                    <h3 class="text-blue-500 font-black uppercase text-[10px] tracking-widest mb-4">Assets Inventory</h3>
                    <div class="space-y-2">
                        <div class="flex justify-between border-b border-slate-50 pb-1">
                            <span class="text-[9px] font-bold text-slate-400 uppercase">TLS Certs</span>
                            <span class="text-xs font-black">${inventory.tls}</span>
                        </div>
                        <div class="flex justify-between border-b border-slate-50 pb-1">
                            <span class="text-[9px] font-bold text-slate-400 uppercase">Active APIs</span>
                            <span class="text-xs font-black">${inventory.apis}</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-[9px] font-bold text-slate-400 uppercase">Web Apps</span>
                            <span class="text-xs font-black">${inventory.logins}</span>
                        </div>
                    </div>
                </div>
            </div>

            <div class="hud-dark">
                <h3 class="text-orange-500 font-black uppercase text-sm mb-8 underline decoration-2 underline-offset-8">Posture of PQC</h3>
                <div class="grid grid-cols-2 gap-10">
                    <div>
                        <p class="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Quantum Resilience Index</p>
                        <div class="w-full bg-slate-800 h-3 rounded-full">
                            <div class="bg-orange-500 h-3 rounded-full" style="width: ${avgPqc}%"></div>
                        </div>
                    </div>
                    <div class="text-right border-l border-slate-800 pl-8">
                        <p class="text-6xl font-black text-white leading-none">${avgPqc}%</p>
                        <p class="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-2">Global Health Score</p>
                    </div>
                </div>
            </div>

            <div class="card flex justify-between items-center bg-slate-50 border-none">
                <div>
                    <h3 class="text-slate-400 font-black uppercase text-[10px] tracking-widest">CBOM Registry</h3>
                    <p class="text-[10px] font-bold text-slate-500 uppercase">Vulnerable Components Detected</p>
                </div>
                <p class="text-5xl font-black text-slate-900 tracking-tighter">${totalVulnerabilities.toLocaleString()}</p>
            </div>

            <div class="pt-10 text-center">
                <p class="text-[9px] font-black text-slate-300 uppercase tracking-[0.8em]">End of Strategic Audit Report</p>
            </div>
        </body>
        </html>
        `;

        // 3. Generate PDF using your reference function
        const pdfBuffer = await generatePdf(htmlContent);

        // 4. Send Response
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=Executive_PQC_Report.pdf');
        res.send(pdfBuffer);

    } catch (err) {
        console.error("REPORT ERROR:", err);
        res.status(500).json({ error: "Failed to build PDF content" });
    }
});

/**
 * @route GET /api/reports/schedule-init
 * @description Fetches all available domains so the user can select the report scope.
 */
router.get("/schedule-init", async (req, res) => {
    try {
        // Fetching domains so the dropdown in the frontend is dynamic
        const domains = await Domain.find().select("domainName _id");
        res.json({ domains });
    } catch (err) {
        res.status(500).json({ error: "Failed to initialize scheduler data" });
    }
});

/**
 * @route POST /api/reports/schedule
 * @description Creates a NEW schedule (previously used findOneAndUpdate which we should remove)
 */
// routes/reportRoutes.js
router.post("/schedule", async (req, res) => {
    try {
        const { scheduleName, targetDomainId, selectedAssets, ...rest } = req.body;

        const newSchedule = new ReportSchedule({
            userId: req.user.id,
            scheduleName,
            targetDomainId,
            // 🔥 Force the structure here to match the Model
            selectedAssets: selectedAssets.map(a => ({
                assetId: a.assetId,
                businessContext: a.businessContext
            })),
            ...rest
        });

        await newSchedule.save();
        res.status(201).json({ message: "Schedule Saved" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * @route GET /api/reports/my-schedule
 * @description Retrieves ALL active reporting schedules for the user.
 */
router.get("/my-schedule", async (req, res) => {
    try {
        // Changed to .find() to get an array of all schedules
        const schedules = await ReportSchedule.find({ userId: req.user.id })
            .populate('targetDomainId', 'domainName')
            .sort({ createdAt: -1 }); // Show newest first
        
        res.json(schedules || []);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch schedules." });
    }
});

/**
 * @route DELETE /api/reports/schedule/:id
 * @description Deletes a specific reporting schedule.
 */
router.delete("/schedule/:id", async (req, res) => {
    try {
        await ReportSchedule.findByIdAndDelete(req.params.id);
        res.json({ message: "Schedule successfully terminated." });
    } catch (err) {
        res.status(500).json({ error: "Delete operation failed." });
    }
});

router.post("/on-demand", async (req, res) => {
    try {
        const { email, targetDomainId, includeSections, scheduleName } = req.body;

        if (!email || !targetDomainId) {
            return res.status(400).json({ message: "Email and Target Domain are required." });
        }

        await processAndSendReport({
            email,
            targetDomainId,
            includeSections,
            scheduleName: scheduleName || "On-Demand Audit"
        });

        res.json({ success: true, message: "Audit report generated and dispatched to " + email });
    } catch (error) {
        console.error("On-Demand Error:", error);
        res.status(500).json({ message: "Failed to process on-demand report." });
    }
});

module.exports = router;