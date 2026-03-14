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

        // Count assets with a high PQC readiness score
        const pqcReadyAssets = await ScanResult.countDocuments({
            pqcReadyScore: { $gte: 0.8 }
        });

        // Identify domains that have at least one asset with a low PQC score
        const riskyResults = await ScanResult.aggregate([
            {
                $match: {
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
            {
                $group: { _id: "$scan.domainId" }
            }
        ]);

        const highRiskDomains = riskyResults.length;

        res.json({
            totalDomains: totalDomains,
            totalAssets: totalAssets,
            highRiskDomains: highRiskDomains,
            pqcReadyAssets: pqcReadyAssets
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({
            error: "Failed to get dashboard stats"
        });
    }
});

module.exports = router;
