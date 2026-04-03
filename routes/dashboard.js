const express = require("express");
const router = express.Router();
const authMiddleware = require("../middlewares/authMiddleware");

const Domain = require("../models/Domain");
const Asset = require("../models/Asset");
const ScanResult = require("../models/ScanResult");

router.use(authMiddleware);

// ✅ SINGLE SOURCE OF TRUTH FOR RISK
const getRiskLevel = (score) => {
    if (score < 0.4) return 'High';
    if (score < 0.7) return 'Medium';
    return 'Low';
};

router.get("/stats", async (req, res) => {
    try {
        const totalAssets = await Asset.countDocuments();

        const publicWebApps = await Asset.countDocuments({
            assetType: { $regex: /web/i }
        });

        const apis = await Asset.countDocuments({
            assetType: { $regex: /api/i }
        });

        const servers = await Asset.countDocuments({
            assetType: { $regex: /server/i }
        });

        const loadBalancers = await Asset.countDocuments({ assetType: { $regex: /load/i } });

        const scannedAssetsCount = await ScanResult.distinct("assetId", { status: "success" });
        const totalScanned = scannedAssetsCount.length;

        const results = await ScanResult.find({ status: "success" }).populate('assetId');

        let pqcSafeCount = 0;
        let pqcReadyCount = 0;
        let pqcVulnerableCount = 0;

        results.forEach(r => {
            const score = r.pqcReadyScore;

            if (score >= 0.9) pqcSafeCount++;
            else if (score >= 0.7) pqcReadyCount++;
            else pqcVulnerableCount++;
        });

        const now = new Date();
        const thirtyDays = new Date(now.getTime() + (30 * 24 * 60 * 60 * 1000));
        const ninetyDays = new Date(now.getTime() + (90 * 24 * 60 * 60 * 1000));

        let riskDist = { high: 0, medium: 0, low: 0 };
        let certTimeline = { urgent: 0, soon: 0, safe: 0 };

        const ipv4InventoryCount = await Asset.countDocuments({
            ip: { $regex: /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/ }
        });

        const ipv6InventoryCount = await Asset.countDocuments({
            ip: { $regex: /:/ }
        });

        results.forEach(r => {
            // ✅ CONSISTENT RISK LOGIC
            const level = getRiskLevel(r.pqcReadyScore);

            if (level === 'High') riskDist.high++;
            else if (level === 'Medium') riskDist.medium++;
            else riskDist.low++;

            // Expiry Logic
            if (r.certificate?.expires) {
                const expiryDate = new Date(r.certificate.expires);
                if (expiryDate <= thirtyDays) certTimeline.urgent++;
                else if (expiryDate <= ninetyDays) certTimeline.soon++;
                else certTimeline.safe++;
            }
        });

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

        const recentAssets = results
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .slice(0, 5)
            .map(r => ({
                host: r.host || r.assetId?.host,
                ip: r.ip || r.assetId?.ip,
                assetType: r.assetId?.assetType || "Unknown",
                // ✅ SAME LOGIC USED HERE
                risk: getRiskLevel(r.pqcReadyScore),
                updatedAt: r.updatedAt
            }));

        res.json({
            totalAssets,
            publicWebApps,
            apis,
            servers,

            expiringCerts: certTimeline.urgent,
            highRiskAssets: riskDist.high,

            scannedAssetsCount: totalScanned,
            pqcReadyAssets: pqcReadyCount,

            typeDistribution: [
                { name: 'Web Applications', value: publicWebApps, color: '#3b82f6' },
                { name: 'APIs', value: apis, color: '#06b6d4' },
                { name: 'Servers', value: servers, color: '#10b981' },
                { name: 'Load Balancers', value: loadBalancers, color: '#f59e0b' },
                { name: 'Other', value: Math.max(0, totalAssets - (publicWebApps + apis + servers + loadBalancers)), color: '#8b5cf6' }
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
                { name: 'Scanned', value: totalScanned, color: '#10b981' },
                { name: 'Unscanned', value: Math.max(0, totalAssets - totalScanned), color: '#334155' }
            ],

            pqcAdoption: [
                { name: 'PQC Safe', value: pqcSafeCount, color: '#8b5cf6' },   // Purple
                { name: 'PQC Ready', value: pqcReadyCount, color: '#22c55e' }, // Green
                { name: 'Vulnerable', value: pqcVulnerableCount, color: '#ef4444' } // Red
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