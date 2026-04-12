/**
 * @file domainRoutes.js
 * @description These routes manage your monitored domains and aggregate their cryptographic 
 * inventory. It gives you both the high-level overview (how ready are we?) and the deep-technical 
 * list of algorithms and certificates found across every host.
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
 * 
 * ---
 * INPUT EXAMPLE:
 * Body: {
 *   "domainName": "example.com",
 *   "organization": "Example Corp"
 * }
 * 
 * ---
 * OUTPUT EXAMPLE:
 * {
 *   "message": "Domain added successfully",
 *   "domain": {
 *      "_id": "64f1a2b3c4d5e6f7a8b9c0d1",
 *      "domainName": "example.com"
 *   }
 * }
 */
router.post("/", async (req, res) => {
  try {
    const { domainName } = req.body;

    if (!domainName) {
      return res.status(400).json({ message: "domainName is required" });
    }
    let domain = await Domain.findOne({ domainName });

    if (domain) {
      return res.json(domain);
    }
    let new_domain = new Domain({ domainName });
    await new_domain.save();

    res.status(201).json(new_domain);
  } catch (error) {
    console.error("Domain processing error:", error);
    res.status(500).json({ message: error.message });
  }
});

/**
 * @route GET /api/domains
 * @description Retrieves all registered domains.
 * @returns {Array<Object>} 200 - List of all Domain documents.
 * 
 * ---
 * OUTPUT EXAMPLE:
 * [
 *   {
 *     "_id": "64f1a2b3c4d5e6f7a8b9c0d1",
 *     "domainName": "example.com",
 *     "createdAt": "2023-09-01T12:00:00.000Z"
 *   }
 * ]
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
 * 
 * ---
 * OUTPUT EXAMPLE:
 * {
 *   "domain": "example.com",
 *   "assets": { "totalAssets": 10, "scannedAssets": 10 },
 *   "pqcReadiness": { "pqcReadyAssets": 2, "averageScore": 0.55 },
 *   "recommendation": { "riskLevel": "MEDIUM", "migrationStrategy": "..." }
 * }
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

    // Find ALL successful scans for this domain
    const completedScans = await Scan.find({ domainId, status: "completed" });

    if (!completedScans || completedScans.length === 0) {
      return res.json({
        domain: domain.domainName,
        totalAssets,
        message: "No scans available"
      });
    }

    const scanIds = completedScans.map(s => s._id);

    // Fetch individual scan results for calculation from ALL these scans
    const results = await ScanResult.find({ scanId: { $in: scanIds } });
    const totalScannedAssets = results.length;

    let pqcReady = 0;
    let migrationReady = 0;
    let legacyCrypto = 0;
    let weakCipherAssets = 0;
    let failedAssets = 0;
    let tlsVersions = {};
    let totalScore = 0;

    results.forEach(r => {
      if (r.status === "failed") {
        failedAssets++;
        return;
      }

      const score = r.pqcReadyScore || 0;
      totalScore += score;

      if (score >= 0.8) pqcReady++;
      else if (score >= 0.4) migrationReady++;
      else legacyCrypto++;

      if (r.weakCiphers && r.weakCiphers.length > 0) weakCipherAssets++;
      if (r.negotiated?.tlsVersion) {
        tlsVersions[r.negotiated.tlsVersion] = (tlsVersions[r.negotiated.tlsVersion] || 0) + 1;
      }
    });

    const successfulScans = totalScannedAssets - failedAssets;
    const avgScore = successfulScans > 0 ? totalScore / successfulScans : 0;

    // ------------------------------------------------------------
    // DOMAIN SUMMARY OBJECT
    // ------------------------------------------------------------
    const summary = {
      domain: domain.domainName,
      assets: {
        totalAssets: totalAssets,
        scannedAssets: totalScannedAssets,
        failedAssets: failedAssets
      },
      pqcReadiness: {
        pqcReadyAssets: pqcReady,
        migrationReadyAssets: migrationReady,
        legacyCryptoAssets: legacyCrypto,
        averageScore: Number(avgScore.toFixed(2))
      },
      risks: {
        weakCipherAssets: weakCipherAssets
      },
      tlsDistribution: tlsVersions
    };

    // ------------------------------------------------------------
    // FETCH OR GENERATE LLM RECOMMENDATION
    // ------------------------------------------------------------
    let recommendation = await DomainRecommendation.findOne({ domainId });

    if (!recommendation || recommendation.basedOnScanCount !== completedScans.length) {
      const llmRec = await generateDomainRecommendation(summary);

      recommendation = await DomainRecommendation.findOneAndUpdate(
        { domainId },
        {
          riskLevel: llmRec.risk_level,
          summary: llmRec.summary,
          migrationStrategy: llmRec.migration_strategy,
          recommendedPqcKex: llmRec.recommended_pqc_kex,
          recommendedPqcSignature: llmRec.recommended_pqc_signature,
          basedOnScanCount: completedScans.length,
          generatedAt: new Date()
        },
        { upsert: true, new: true }
      );
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
 * 
 * ---
 * OUTPUT EXAMPLE:
 * {
 *   "domainId": "64f1a2b3c4d5e6f7a8b9c0d1",
 *   "algorithms": ["X25519", "RSA-PSS", "ML-KEM-768"]
 * }
 */
router.get("/:domainId/crypto-inventory", async (req, res) => {
  try {
    const domainId = req.params.domainId;
    const completedScans = await Scan.find({ domainId, status: "completed" });

    if (!completedScans || completedScans.length === 0) {
      return res.status(404).json({ message: "No scan found" });
    }

    const scanIds = completedScans.map(s => s._id);
    const results = await ScanResult.find({ scanId: { $in: scanIds } });
    const algorithms = new Set();

    results.forEach(r => {
      if (r.negotiated?.keyExchange) algorithms.add(r.negotiated.keyExchange);
      if (r.certificate?.signatureAlgorithm) algorithms.add(r.certificate.signatureAlgorithm);
      if (r.negotiated?.cipher) algorithms.add(r.negotiated.cipher);
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