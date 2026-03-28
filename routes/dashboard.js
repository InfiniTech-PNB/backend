/**
 * @file dashboard.js
 * @description These routes provide a high-level "bird's-eye view" of your entire security 
 * ecosystem. It aggregates data from every domain and asset to give you a single dashboard 
 * showing your overall risk and PQC readiness.
 */

const express = require("express");
const router = express.Router();
const authMiddleware = require("../middlewares/authMiddleware");

const Domain = require("../models/Domain");
const Asset = require("../models/Asset");
const ScanResult = require("../models/ScanResult");

// Apply authentication to all dashboard routes
router.use(authMiddleware);

/**
 * @route GET /api/dashboard/stats
 * @description Aggregates stats from Domains, Assets, and ScanResults.
 * Includes total counts, PQC-ready assets (score >= 0.8), and high-risk domains.
 *
 * PQC Scoring Thresholds:
 * 0.00 – 0.40 → Quantum Vulnerable (HIGH RISK)
 * 0.40 – 0.70 → Migration Required (MEDIUM RISK)
 * 0.70 – 0.9 -> PQC Ready
 * 0.9 - 1.0 -> PQC Safe
 *
 * @returns {Object} 200 - Stats object containing totalDomains, totalAssets, highRiskDomains, and pqcReadyAssets.
 * @returns {Error} 500 - Aggregation failure.
 * 
 * ---
 * OUTPUT EXAMPLE:
 * {
 *   "totalDomains": 5,
 *   "totalAssets": 120,
 *   "pqcReadyAssets": 45,
 *   "highRiskDomains": 2
 * }
 */
router.get("/stats", async (req, res) => {
    try {
        // 1. Base Inventory Counts (Direct from Asset collection)
        // 1. Base Inventory Counts (Using Case-Insensitive Regex)
        const totalAssets = await Asset.countDocuments();

        // This looks for any string containing "web" (covers "Web", "web", "Web App")
        const publicWebApps = await Asset.countDocuments({
            assetType: { $regex: /web/i }
        });

        // This looks for any string containing "api"
        const apis = await Asset.countDocuments({
            assetType: { $regex: /api/i }
        });

        // This looks for "server"
        const servers = await Asset.countDocuments({
            assetType: { $regex: /server/i }
        });

        const loadBalancers = await Asset.countDocuments({ assetType: { $regex: /load/i } });

        const scannedAssetsCount = await ScanResult.distinct("assetId", { status: "success" });
        const totalScanned = scannedAssetsCount.length;

        // PQC Ready (from those scanned)
        const pqcReadyCount = await ScanResult.countDocuments({
            status: "success",
            pqcReadyScore: { $gte: 0.8 }
        });

        // 2. Fetch only successful scan results to ensure we have cryptographic data
        const results = await ScanResult.find({ status: "success" }).populate('assetId');

        // 3. Define Time Windows for Certificates
        const now = new Date();
        const thirtyDays = new Date(now.getTime() + (30 * 24 * 60 * 60 * 1000));
        const ninetyDays = new Date(now.getTime() + (90 * 24 * 60 * 60 * 1000));

        // 4. Detailed Aggregation from Results
        let riskDist = { high: 0, medium: 0, low: 0 };
        let certTimeline = { urgent: 0, soon: 0, safe: 0 };

        const ipv4InventoryCount = await Asset.countDocuments({
            ip: { $regex: /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/ }
        });

        const ipv6InventoryCount = await Asset.countDocuments({
            ip: { $regex: /:/ } // Simple check for IPv6 colons
        });

        results.forEach(r => {
            // Risk Logic
            if (r.pqcReadyScore < 0.7) riskDist.high++;
            else if (r.pqcReadyScore < 0.9) riskDist.medium++;
            else riskDist.low++;

            // Expiry Logic (Safe parsing of certificate dates)
            if (r.certificate?.expires) {
                const expiryDate = new Date(r.certificate.expires);
                if (expiryDate <= thirtyDays) certTimeline.urgent++;
                else if (expiryDate <= ninetyDays) certTimeline.soon++;
                else certTimeline.safe++;
            }
        });

        // 5. Crypto Overview Mapping (Right Sidebar)
        const cryptoOverview = results
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .slice(0, 10)
            .map(r => {
                const pqcAlgo = r.pqc?.negotiated?.[0];
                return {
                    asset: r.host || r.assetId?.host || "Unknown",
                    displayAlgo: pqcAlgo || r.negotiated?.cipher?.split('_')[0] || "Unknown",
                    isPqc: !!pqcAlgo,
                    keyLength: r.negotiated?.serverTempKeySize || 2048,
                    tls: r.negotiated?.tlsVersion || "1.2"
                };
            });

        // 6. Recent Assets Mapping (Table)
        const recentAssets = results
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .slice(0, 5)
            .map(r => ({
                host: r.host || r.assetId?.host,
                ip: r.ip || r.assetId?.ip,
                assetType: r.assetId?.assetType || "Unknown",
                risk: r.pqcReadyScore < 0.4 ? 'High' : r.pqcReadyScore < 0.7 ? 'Medium' : 'Low',
                updatedAt: r.updatedAt
            }));

        // 7. Aggregate JSON Response
        res.json({
            totalAssets,
            publicWebApps,
            apis,
            servers,
            // CRITICAL: Ensure these keys match your StatCards in HomeTab.jsx
            expiringCerts: certTimeline.urgent,
            highRiskAssets: riskDist.high,

            scannedAssetsCount: totalScanned,
            pqcReadyAssets: pqcReadyCount,

            typeDistribution: [
                { name: 'Web Applications', value: publicWebApps, color: '#3b82f6' }, // Blue
                { name: 'APIs', value: apis, color: '#06b6d4' }, // Cyan
                { name: 'Servers', value: servers, color: '#10b981' }, // Green
                { name: 'Load Balancers', value: loadBalancers, color: '#f59e0b' }, // Orange
                { name: 'Other', value: Math.max(0, totalAssets - (publicWebApps + apis + servers + loadBalancers)), color: '#8b5cf6' } // Purple
            ],
            riskDistribution: [
                { name: 'High', value: riskDist.high },
                { name: 'Medium', value: riskDist.medium },
                { name: 'Low', value: riskDist.low }
            ],
            certExpiry: [
                { name: '0-30 Days', value: certTimeline.urgent },
                { name: '30-90 Days', value: certTimeline.soon },
                { name: '> 90 Days', value: certTimeline.safe }
            ],
            ipBreakdown: {
                ipv4: totalAssets > 0 ? Math.round((ipv4InventoryCount / totalAssets) * 100) : 0,
                ipv6: totalAssets > 0 ? Math.round((ipv6InventoryCount / totalAssets) * 100) : 0
            },
            auditCoverage: [
                { name: 'Scanned', value: totalScanned, color: '#10b981' }, // Green
                { name: 'Unscanned', value: Math.max(0, totalAssets - totalScanned), color: '#334155' } // Slate
            ],
            pqcAdoption: [
                { name: 'PQC Safe', value: pqcReadyCount, color: '#8b5cf6' }, // Purple
                { name: 'Vulnerable', value: Math.max(0, totalScanned - pqcReadyCount), color: '#ef4444' } // Red
            ],
            recentAssets,
            cryptoOverview
        });

    } catch (err) {
        console.error("Dashboard Aggregation Error:", err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
