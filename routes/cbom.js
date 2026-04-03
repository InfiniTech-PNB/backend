/**
 * @file cbom.js
 * @description These routes generate a Cryptographic Bill of Materials (CBOM).
 * Think of a CBOM as an "ingredients list" for your cybersecurity – it tells you exactly what 
 * algorithms, keys, and certificates are protecting your domain.
 */

const express = require("express");
const router = express.Router();
const axios = require("axios");
const authMiddleware = require("../middlewares/authMiddleware");

const ScanResult = require("../models/ScanResult");
const Cbom = require("../models/Cbom");
const cbomToHtml = require("../services/cbomToHtml");
const generatePdf = require("../services/generatePdf");

const { toCamel, toSnake } = require("../utils/caseConverter");

// Apply authentication to all CBOM routes
router.use(authMiddleware);

/**
 * @route POST /api/cbom/:id
 * @description Generates a new CBOM for a scan.
 * You can choose between two modes:
 * 1. "aggregate" -> A global list of every unique algorithm found across the domain.
 * 2. "perAsset"  -> A detailed breakdown where every algorithm is linked to its specific host.
 *
 * ---
 * INPUT EXAMPLE:
 * Path Param: id = "67c8..." (The scan ID)
 * Body: { "mode": "perAsset" }
 *
 * ---
 * OUTPUT EXAMPLE:
 * {
 *   "cbomId": "69c6...",
 *   "mode": "perAsset",
 *   "cbom": {
 *      "assets": ["api.example.com"],
 *      "algorithms": [{ "name": "Kyber-768", "asset": "api.example.com", ... }],
 *      "failedAssets": []
 *   }
 * }
 */
router.post("/:id", async (req, res) => {
  try {
    const scanId = req.params.id;
    const { mode = "aggregate" } = req.body;

    // 🔥 Check existing CBOM with SAME mode
    const existingCbom = await Cbom.findOne({ scanId, mode });
    if (existingCbom) {
      return res.json({
        cbomId: existingCbom._id,
        cbom: existingCbom
      });
    }

    const scanResults = await ScanResult.find({ scanId }).populate("assetId");

    if (!scanResults.length) {
      return res.status(400).json({
        message: "No scan results found"
      });
    }

    // Convert Mongoose documents (including failed assets) to plain objects and then to snake_case for FastAPI
    const snakeScanResults = scanResults.map(r => {
      const plain = r.toObject();
      return toSnake({
        host: r.assetId?.host || r.host,
        ip: r.assetId?.ip || r.ip,
        port: r.port,
        protocol: r.protocol,
        status: r.status,
        failure_reason: r.failureReason,
        negotiated: plain.negotiated,
        supported: plain.supported,
        pqc: plain.pqc,
        certificate: plain.certificate,
        weak_ciphers: plain.weakCiphers,
        pfs_supported: plain.pfsSupported,
        vulnerabilities: plain.vulnerabilities
      });
    });

    // =========================
    // 🔥 CALL FASTAPI
    // =========================
    const apiUrl=process.env.API_URL;
    const response = await axios.post(`${apiUrl}:8000/cbom`, {
      results: snakeScanResults,
      mode: mode === "perAsset" ? "per_asset" : "aggregate"
    });

    const cbomDataRaw = response.data;
    const cbomData = toCamel(cbomDataRaw);

    // =========================
    // 🔥 STORE CBOM (CAMELCASE)
    // =========================
    const cbomMode = (mode === "perAsset" || mode === "per_asset") ? "per_asset" : "aggregate";

    let algorithms = [];
    let keys = [];
    let protocols = [];
    let certificates = [];
    let assets = [];

    if (cbomMode === "aggregate") {
      assets = cbomData.cbom.assets || [];
      algorithms = cbomData.cbom.algorithms || [];
      keys = cbomData.cbom.keys || [];
      protocols = cbomData.cbom.protocols || [];
      certificates = cbomData.cbom.certificates || [];
    } else {
      // per_asset mode → Flatten data while keeping asset association
      const rawAssets = cbomData.cbom.assets || [];
      assets = rawAssets.map(a => a.asset);

      rawAssets.forEach(a => {
        const host = a.asset;

        if (a.algorithms) {
          a.algorithms.forEach(algo => algorithms.push({ ...algo, asset: host }));
        }
        if (a.keys) {
          a.keys.forEach(k => keys.push({ ...k, asset: host }));
        }
        if (a.protocols) {
          a.protocols.forEach(p => protocols.push({ ...p, asset: host }));
        }
        if (a.certificates) {
          // Certificates already have 'asset' in their schema, but let's be sure
          a.certificates.forEach(c => certificates.push({ ...c, asset: c.asset || host }));
        }
      });
    }

    const cbom = await Cbom.create({
      scanId: scanId,
      mode: cbomMode,
      assets,
      failedAssets: cbomData.cbom.failedAssets || [],
      algorithms,
      keys,
      protocols,
      certificates
    });

    return res.json({
      cbomId: cbom._id,
      mode,
      cbom
    });

  } catch (error) {
    console.error("Error generating CBOM:", error);
    res.status(500).json({ message: error.message });
  }
});

/**
 * @route GET /api/cbom/:scanId/cbom
 * @description Fetches the existing CBOM for a specific scan.
 * @param {string} scanId - The MongoDB ID of the Scan.
 * @returns {Object} 200 - The CBOM document.
 * @returns {Error} 404 - CBOM not found.
 *
 * @example
 * // Output:
 * // {
 * //   "_id": "64f1b2c3d4e5f6a7b8c9d0e1",
 * //   "scanId": "64f1a2b3c4d5e6f7a8b9c0d1",
 * //   "algorithms": [...],
 * //   "keys": [...],
 * //   "protocols": [...],
 * //   "certificates": [...]
 * // }
 */
router.get("/:scanId/cbom", async (req, res) => {
  try {
    const cbom = await Cbom.findOne({
      scanId: req.params.scanId
    });

    if (!cbom) {
      return res.status(404).json({
        message: "CBOM not found"
      });
    }

    res.json(cbom);
  } catch (error) {
    res.status(500).json({
      message: error.message
    });
  }
});

/**
 * @route GET /api/cbom/:scanId/cbom/pdf
 * @description Generates and downloads a PDF report of the CBOM.
 * @param {string} scanId - The MongoDB ID of the Scan.
 * @returns {Binary} 200 - PDF file stream.
 * @returns {Error} 404 - CBOM not found.
 * @returns {Error} 500 - PDF generation failure.
 * 
 * @example
 * // Output: Binary PDF file downloaded as "cbom-report.pdf"
 */
router.get("/:scanId/cbom/pdf", async (req, res) => {
  try {
    const cbom = await Cbom.findOne({
      scanId: req.params.scanId
    });

    if (!cbom) {
      return res.status(404).json({
        error: "CBOM not found"
      });
    }

    const html = cbomToHtml(cbom);
    const pdf = await generatePdf(html);

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": "attachment; filename=cbom-report.pdf"
    });

    res.send(pdf);
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Failed to generate PDF"
    });
  }
});

module.exports = router;