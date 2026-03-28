const Asset = require("../models/Asset");
const Scan = require("../models/Scan");
const ScanResult = require("../models/ScanResult");
const Recommendation = require("../models/Recommendation");

/**
 * @function computeDomainSummary
 * @description Aggregates domain-wide statistics for the Strategic HUD.
 * Replicates the logic from the frontend HistoryTab HUD.
 */
const computeDomainSummary = async (domainId) => {
    try {
        // 1. Setup Scope
        const query = domainId && domainId !== 'all' ? { domainId } : {};

        // 2. Asset Statistics
        const totalAssets = await Asset.countDocuments(query);
        
        // 3. Find the most recent COMPLETED scan for this domain
        const latestScan = await Scan.findOne({ ...query, status: "completed" })
            .sort({ startedAt: -1 });

        if (!latestScan) {
            return {
                assets: { totalAssets, scannedAssets: 0 },
                pqcReadiness: { averageScore: 0 },
                recommendation: { riskLevel: "UNKNOWN", summary: "No scan data available." }
            };
        }

        // 4. Fetch Results from that specific scan
        const results = await ScanResult.find({ scanId: latestScan._id });
        const scannedCount = results.length;

        // 5. Calculate Metrics (Readiness & Scores)
        let totalScore = 0;
        let successfulResults = 0;

        results.forEach(r => {
            if (r.status !== "failed") {
                totalScore += (r.pqcReadyScore || 0);
                successfulResults++;
            }
        });

        const avgScore = successfulResults > 0 ? (totalScore / successfulResults) : 0;

        // 6. Fetch Aggregate AI Insights
        // We grab the highest risk or latest recommendation linked to this scan
        const latestRec = await Recommendation.findOne({ 
            scanResultId: { $in: results.map(r => r._id) } 
        }).sort({ createdAt: -1 });

        return {
            assets: {
                totalAssets,
                scannedAssets: scannedCount
            },
            pqcReadiness: {
                averageScore: avgScore // This is the 'Grade' shown in your HUD
            },
            recommendation: {
                // Logic based on your React getClassification logic
                riskLevel: avgScore >= 0.7 ? "LOW" : avgScore >= 0.4 ? "MEDIUM" : "HIGH",
                summary: latestRec?.recommendations || "System analysis suggest an immediate deep scan of all nodes.",
                recommendedPqcKex: latestRec?.recommendedPqcKex || "ML-KEM-768",
                recommendedPqcSignature: latestRec?.recommendedPqcSignature || "Dilithium-G"
            }
        };
    } catch (err) {
        console.error("Critical: computeDomainSummary failed", err);
        return null;
    }
};

module.exports = { computeDomainSummary };