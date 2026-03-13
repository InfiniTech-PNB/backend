/**
 * @file domainRoutes.js
 * @description Routes for managing domains and generating high-level cryptographic summaries and recommendations.
 */

const express = require("express");
const router = express.Router();
const authMiddleware = require("../middlewares/authMiddleware");

const Domain = require("../models/Domain");
const Asset = require("../models/Asset");
const Scan = require("../models/Scan");
const ScanResult = require("../models/ScanResult");
const DomainRecommendation = require("../models/DomainRecommendation");
const generateDomainRecommendation = require("../services/generateDomainRecommendation");

// Apply authentication to all domain routes
router.use(authMiddleware);

/**
 * @route POST /api/domains
 * @description Adds a new root domain to the monitoring system.
 * @body {string} domainName - The domain to track (e.g., example.com).
 * @returns {Object} 200 - The created Domain document.
 */
router.post("/", async (req, res) => {
  try {
    const { domainName } = req.body;
    const domain = new Domain({ domainName });
    await domain.save();
    res.json(domain);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/**
 * @route GET /api/domains
 * @description Retrieves all registered domains.
 * @returns {Array<Object>} 200 - List of all Domain documents.
 */
router.get("/", async (req, res) => {
  try {
    const domains = await Domain.find();
    if (!domains) {
      return res.status(404).json({ message: "No domains found" });
    }
    res.json(domains);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/**
 * @route GET /api/domains/:domainId/summary
 * @description Generates a comprehensive cryptographic summary and PQC recommendation for a domain.
 * Aggregates results from the latest internal scan and uses LLM for the recommendation.
 * @param {string} domainId - Target Domain ID.
 * @returns {Object} 200 - Summary object including asset counts, PQC readiness, risks, and LLM recommendation.
 * @returns {Error} 404 - Domain not found.
 */
router.get("/:domainId/summary", async (req, res) => {
  try {
    const domainId = req.params.domainId;
    const domain = await Domain.findById(domainId);
    if (!domain) {
      return res.status(404).json({ message: "Domain not found" });
    }
    
    // Count total tracked assets
    const totalAssets = await Asset.countDocuments({ domainId });
    
    // Find the most recent scan job
    const latestScan = await Scan.findOne({ domainId }).sort({ startedAt: -1 });

    if (!latestScan) {
      return res.json({
        domain: domain.domainName,
        totalAssets,
        message: "No scans available"
      });
    }

    if (latestScan.status !== "completed") {
      return res.json({
        domain: domain.domainName,
        totalAssets,
        message: "Scan not completed"
      });
    }

    // Fetch individual scan results for calculation
    const results = await ScanResult.find({ scanId: latestScan._id });
    const totalScannedAssets = results.length;
    
    let pqcReady = 0;
    let migrationReady = 0;
    let legacyCrypto = 0;
    let weakCipherAssets = 0;
    let tlsVersions = {};
    let totalScore = 0;

    results.forEach(r => {
      const score = r.pqcReadyScore || 0;
      totalScore += score;

      if (score >= 0.8) pqcReady++;
      else if (score >= 0.4) migrationReady++;
      else legacyCrypto++;

      if (r.weakCiphers && r.weakCiphers.length > 0) weakCipherAssets++;
      if (r.tlsVersion) {
        tlsVersions[r.tlsVersion] = (tlsVersions[r.tlsVersion] || 0) + 1;
      }
    });

    const avgScore = totalScannedAssets > 0 ? totalScore / totalScannedAssets : 0;

    // ------------------------------------------------------------
    // DOMAIN SUMMARY OBJECT
    // ------------------------------------------------------------
    const summary = {
      domain: domain.domainName,
      assets: {
        total_assets: totalAssets,
        scanned_assets: totalScannedAssets
      },
      pqc_readiness: {
        pqc_ready_assets: pqcReady,
        migration_ready_assets: migrationReady,
        legacy_crypto_assets: legacyCrypto,
        average_score: Number(avgScore.toFixed(2))
      },
      risks: {
        weak_cipher_assets: weakCipherAssets
      },
      tls_distribution: tlsVersions
    };

    // ------------------------------------------------------------
    // FETCH OR GENERATE LLM RECOMMENDATION
    // ------------------------------------------------------------
    let recommendation = await DomainRecommendation.findOne({ scanId: latestScan._id });

    if (!recommendation) {
      const llmRec = await generateDomainRecommendation(summary);
      recommendation = await DomainRecommendation.create({
        domainId,
        scanId: latestScan._id,
        summary: llmRec.summary,
        riskLevel: llmRec.risk_level,
        migrationStrategy: llmRec.migration_strategy,
        recommendedPqcKex: llmRec.recommended_pqc_kex,
        recommendedPqcSignature: llmRec.recommended_pqc_signature
      });
    }

    res.json({
      ...summary,
      recommendation
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
});

/**
 * @route GET /api/domains/:domainId/crypto-inventory
 * @description Extracts a unique list of all cryptographic algorithms (KEX, Signatures, Ciphers) used across a domain.
 * @param {string} domainId - Target Domain ID.
 * @returns {Object} 200 - Object containing domainId and the list of unique algorithms.
 */
router.get("/:domainId/crypto-inventory", async (req, res) => {
  try {
    const domainId = req.params.domainId;
    const latestScan = await Scan.findOne({ domainId }).sort({ startedAt: -1 });

    if (!latestScan) {
      return res.status(404).json({ message: "No scan found" });
    }

    const results = await ScanResult.find({ scanId: latestScan._id });
    const algorithms = new Set();

    results.forEach(r => {
      if (r.keyExchange) algorithms.add(r.keyExchange);
      if (r.signatureAlgorithm) algorithms.add(r.signatureAlgorithm);
      if (r.cipher) algorithms.add(r.cipher);
    });

    res.json({
      domainId,
      algorithms: [...algorithms]
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to get crypto inventory" });
  }
});

module.exports = router;