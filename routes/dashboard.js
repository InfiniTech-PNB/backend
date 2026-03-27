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
        const totalDomains = await Domain.countDocuments();
        const totalAssets = await Asset.countDocuments();

        // 1. Get unique assets that have actually appeared in a SUCCESSFUL scan result
        const scannedAssets = await ScanResult.distinct("assetId", {
            status: { $ne: "failed" }
        });
        const scannedAssetsCount = scannedAssets.length;

        // 2. Count PQC-ready assets from successful scans
        const pqcReadyAssets = await ScanResult.countDocuments({
            status: { $ne: "failed" },
            pqcReadyScore: { $gte: 0.8 }
        });

        // 3. Identify risky domains (at least one asset < 0.4 in successful scans)
        const riskyResults = await ScanResult.aggregate([
            {
                $match: {
                    status: { $ne: "failed" },
                    pqcReadyScore: { $lt: 0.4 }
                }
            },
            {
                $lookup: {
                    from: "scans",
                    localField: "scanId",
                    foreignField: "_id",
                    as: "scan"
                }
            },
            { $unwind: "$scan" },
            { $group: { _id: "$scan.domainId" } }
        ]);

        const highRiskDomains = riskyResults.length;

        // Send detailed breakdown
        res.json({
            totalDomains,
            totalAssets, // Total in inventory
            scannedAssetsCount, // Total actually scanned (succesfully)
            highRiskDomains,
            pqcReadyAssets,
            pqcAdoptionRate: scannedAssetsCount > 0
                ? (pqcReadyAssets / scannedAssetsCount).toFixed(2)
                : 0,
            scanCoverage: totalAssets > 0
                ? (scannedAssetsCount / totalAssets).toFixed(2)
                : 0
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to aggregate stats" });
    }
});

module.exports = router;
