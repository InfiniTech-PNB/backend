/**
 * @file dashboard.js
 * @description Routes for fetching high-level statistics and risk summaries for the dashboard.
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
 * @returns {Object} 200 - Stats object containing totalDomains, totalAssets, highRiskDomains, and pqcReadyAssets.
 * @returns {Error} 500 - Aggregation failure.
 * 
 * @example
 * // Output:
 * // {
 * //   "totalDomains": 5,
 * //   "totalAssets": 120,
 * //   "highRiskDomains": 2,
 * //   "pqcReadyAssets": 15
 * // }
 */
router.get("/stats", async (req, res) => {
    try {
        const totalDomains = await Domain.countDocuments();
        const totalAssets = await Asset.countDocuments();

        // 1. Get unique assets that have actually appeared in a scan result
        const scannedAssets = await ScanResult.distinct("assetId");
        const scannedAssetsCount = scannedAssets.length;

        // 2. Count PQC-ready assets specifically from those scanned
        const pqcReadyAssets = await ScanResult.countDocuments({
            pqcReadyScore: { $gte: 0.9 }
        });

        // 3. Identify risky domains (at least one asset < 0.4)
        const riskyResults = await ScanResult.aggregate([
            { $match: { pqcReadyScore: { $lt: 0.4 } } },
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
            scannedAssetsCount, // Total actually scanned
            highRiskDomains,
            pqcReadyAssets,
            // Comparison logic: % of scanned assets that are safe
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
