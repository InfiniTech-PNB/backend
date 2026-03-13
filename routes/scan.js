/**
 * @file scan.js
 * @description Routes for initiating and managing cryptographic scans.
 * Coordinates between Python scanner service and ML scoring service.
 */

const express = require("express");
const router = express.Router();
const authMiddleware = require("../middlewares/authMiddleware");

const Asset = require("../models/Asset");
const Scan = require("../models/Scan");
const ScanResult = require("../models/ScanResult");
const Recommendation = require("../models/Recommendation");
const Service = require("../models/Service");
const axios = require("axios");
const deriveMLFeatures = require("../services/mlFeatureExtractor");
const generateRecommendation = require("../services/generateRecommendation");
const runWithConcurrency = require("../services/runWithConcurrency");

// Apply authentication to all scan routes
router.use(authMiddleware);

/**
 * @route POST /api/scan
 * @description Starts a new cryptographic scan (soft or deep) for specific assets.
 * @body {string} domainId - ID of the parent domain.
 * @body {string} [scanType="soft"] - Type of scan to perform.
 * @body {Array<string>} assets - List of Asset IDs to scan.
 * @returns {Object} 200 - Scan summary and ID.
 */
router.post("/", async (req, res) => {
    try {
        const { domainId, scanType, assets } = req.body;
        if (!domainId || !assets || assets.length === 0) {
            return res.status(400).json({
                message: "domainId and assets are required"
            });
        }
        
        // Create the scan record
        const scan = await Scan.create({
            domainId,
            scanType: scanType || "soft",
            assets,
            status: "pending",
            startedAt: new Date()
        });

        const selectedAssets = await Asset.find({ _id: { $in: assets } });
        if (!selectedAssets.length) {
            return res.status(404).json({ message: "Assets not found" });
        }

        const assetMap = {};
        selectedAssets.forEach(asset => { assetMap[asset.host] = asset._id; });

        // Get associated services for these assets
        const services = await Service.find({ assetId: { $in: assets } });
        const serviceMap = {};
        services.forEach(service => {
            if (!serviceMap[service.assetId]) serviceMap[service.assetId] = [];
            serviceMap[service.assetId].push({
                port: service.port,
                protocol_name: service.protocolName
            });
        });

        const scannerAssets = selectedAssets.map(asset => ({
            host: asset.host,
            ip: asset.ip,
            services: serviceMap[asset._id] || []
        }));

        // Trigger Python Scanner Service
        const response = await axios.post("http://localhost:8000/scan", {
            assets: scannerAssets,
            scan_type: scanType || "soft"
        });
        const data = response.data;

        const resultsToInsert = [];

        // For each result, derive ML features and get a PQC score
        for (const result of data.results) {
            let score = null;
            try {
                const mlFeatures = deriveMLFeatures(result);
                // Call Python ML scoring service
                const mlResponse = await fetch("http://localhost:9000/pqc-score", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ features: mlFeatures })
                });
                const mlData = await mlResponse.json();
                score = mlData.scores ? mlData.scores[0] : null;
            } catch (err) {
                console.error("ML scoring failed for host:", result.host, err);
            }

            resultsToInsert.push({
                scanId: scan._id,
                domainId: domainId,
                assetId: assetMap[result.host],
                host: result.host,
                ip: result.ip,
                port: result.port,
                protocol: result.protocol,
                tlsVersion: result.tls_version,
                cipher: result.cipher,
                keyExchange: result.key_exchange,
                signatureAlgorithm: result.signature_algorithm,
                supportedTlsVersions: result.supported_tls_versions,
                cipherSuites: result.cipher_suites,
                weakCiphers: result.weak_ciphers,
                keySize: result.key_size,
                issuer: result.issuer,
                expires: result.expires,
                pfsSupported: result.pfs_supported,
                vulnerabilities: result.vulnerabilities,
                selfSigned: result.self_signed,
                pqcKeyExchange: result.pqc_key_exchange,
                pqcSignature: result.pqc_signature,
                hybridPqc: result.hybrid_pqc,
                pqcReadyScore: score
            });
        }

        // Persist results and complete scan
        await ScanResult.insertMany(resultsToInsert);
        scan.status = "completed";
        scan.completedAt = new Date();
        await scan.save();

        res.json({
            scanId: scan._id,
            results: data.results
        });
    } catch (error) {
        console.error("Error fetching scans:", error);
        res.status(500).json({ message: error.message });
    }
});

/**
 * @route GET /api/scan/:id/status
 * @description Gets the current status and timing of a scan job.
 * @param {string} id - Scan ID.
 * @returns {Object} 200 - Status, startedAt, and completedAt.
 */
router.get("/:id/status", async (req, res) => {
    try {
        const scan = await Scan.findById(req.params.id).select("status startedAt completedAt");
        if (!scan) {
            return res.status(404).json({ message: "Scan not found" });
        }
        res.json({
            status: scan.status,
            startedAt: scan.startedAt,
            completedAt: scan.completedAt
        });
    } catch (error) {
        console.error("Error fetching scan status:", error);
        res.status(500).json({ message: error.message });
    }
});

/**
 * @route GET /api/scan/:id/results
 * @description Retrieves the raw cryptographic results for a completed scan.
 * @param {string} id - Scan ID.
 * @returns {Array<Object>} 200 - List of ScanResult documents.
 */
router.get("/:id/results", async (req, res) => {
    try {
        const scan = await Scan.findById(req.params.id);
        if (!scan) {
            return res.status(404).json({ message: "Scan not found" });
        }
        const results = await ScanResult.find({ scanId: scan._id }).sort({ host: 1 });
        res.json(results);
    } catch (error) {
        console.error("Error fetching scan results:", error);
        res.status(500).json({ message: error.message });
    }
});

/**
 * @route POST /api/scan/:scanId/recommendations
 * @description Generates AI recommendations for every asset in a scan using LLM.
 * @param {string} scanId - Scan ID.
 * @returns {Array<Object>} 200 - List of created Recommendation documents.
 */
router.post("/:scanId/recommendations", async (req, res) => {
    try {
        const scanId = req.params.scanId;
        const scan = await Scan.findById(scanId);
        if (!scan) {
            return res.status(404).json({ message: "Scan not found" });
        }
        if(scan.status !== "completed") {
            return res.status(400).json({ message: "Scan is not completed" });
        }
        const results = await ScanResult.find({ scanId });

        // Map results to asynchronous tasks for concurrent processing
        const tasks = results.map(result => async () => {
            const ai = await generateRecommendation(result);
            const recommendation = await Recommendation.create({
                scanResultId: result._id,
                host: result.host,
                pqcScore: result.pqcReadyScore,
                riskLevel: ai.risk_level,
                recommendations: ai.recommendations,
                migrationSteps: ai.migration_steps,
                recommendedPqcKex: ai.recommended_pqc_kex,
                recommendedPqcSignature: ai.recommended_pqc_signature
            });
            return recommendation;
        });
        
        // Execute LLM calls with controlled concurrency (e.g., 5 at a time)
        const recommendations = await runWithConcurrency(tasks, 5);
        res.json(recommendations);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to generate recommendations" });
    }
});

/**
 * @route GET /api/scan/:scanId/recommendations
 * @description Retrieves previously generated recommendations for a scan.
 * @param {string} scanId - Scan ID.
 * @returns {Array<Object>} 200 - List of Recommendation documents.
 */
router.get("/:scanId/recommendations", async (req, res) => {
  try {
    const scanId = req.params.scanId;
    const scanResults = await ScanResult.find({ scanId }).select("_id");
    const scanResultIds = scanResults.map(r => r._id);
    
    const recommendations = await Recommendation.find({
      scanResultId: { $in: scanResultIds }
    });
    res.json(recommendations);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to get recommendations" });
  }
});

/**
 * @route PATCH /api/scan/:id/cancel
 * @description Cancels a pending or running scan.
 * @param {string} id - Scan ID.
 * @returns {Object} 200 - Success message.
 */
router.patch("/:id/cancel", async (req, res) => {
    try {
        const scan = await Scan.findById(req.params.id);
        if (!scan) {
            return res.status(404).json({ message: "Scan not found" });
        }
        if (scan.status === "completed") {
            return res.status(400).json({ message: "Scan already completed" });
        }
        if (scan.status === "cancelled") {
            return res.status(400).json({ message: "Scan already cancelled" });
        }
        scan.status = "cancelled";
        scan.completedAt = new Date();
        await scan.save();
        res.json({ message: "Scan cancelled successfully" });
    } catch (error) {
        console.error("Error cancelling scan:", error);
        res.status(500).json({ message: error.message });
    }
});

/**
 * @route GET /api/scan/domain/:domainId
 * @description Fetches all scan history for a specific domain.
 * @param {string} domainId - Target Domain ID.
 * @returns {Object} 200 - Total count and list of scans.
 */
router.get("/domain/:domainId", async (req, res) => {
    try {
        const scans = await Scan
            .find({ domainId: req.params.domainId })
            .sort({ createdAt: -1 });

        res.json({
            total: scans.length,
            scans
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;