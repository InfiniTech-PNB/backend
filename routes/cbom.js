/**
 * @file cbom.js
 * @description Routes for generating, fetching, and exporting Cryptographic Bill of Materials (CBOM).
 */

const express = require("express");
const router = express.Router();
const axios = require("axios");
const authMiddleware = require("../middlewares/authMiddleware");

const ScanResult = require("../models/ScanResult");
const Cbom = require("../models/Cbom");
const cbomToHtml = require("../services/cbomToHtml");
const generatePdf = require("../services/generatePdf");

// Apply authentication to all CBOM routes
router.use(authMiddleware);

/**
 * @route POST /api/cbom/:id
 * @description Generates a new CBOM for a completed scan.
 * @param {string} id - The MongoDB ID of the Scan.
 * @returns {Object} 200 - The generated CBOM object and its ID.
 * @returns {Error} 400 - No scan results found.
 * @returns {Error} 500 - Generation failure.
 */
router.post("/:id", async (req, res) => {
    try {
        const scanId = req.params.id;
        const scanResults = await ScanResult.find({ scanId: scanId }).populate("assetId");
        if (!scanResults.length) {
            return res.status(400).json({
                message: "No scan results found"
            });
        }

        // convert mongoose docs → plain JSON for Python service
        const scannerResults = scanResults.map(r => ({
            host: r.assetId.host,
            ip: r.assetId.ip,
            port: r.port,
            protocol: r.protocol,
            tls_version: r.tlsVersion,
            cipher: r.cipher,
            key_exchange: r.keyExchange,
            signature_algorithm: r.signatureAlgorithm,
            pqc_key_exchange: r.pqcKeyExchange,
            pqc_signature: r.pqcSignature,
            hybrid_pqc: !!r.hybridPqc,
            supported_tls_versions: r.supportedTlsVersions,
            cipher_suites: r.cipherSuites,
            weak_ciphers: r.weakCiphers,
            key_size: r.keySize,
            issuer: r.issuer,
            expires: r.expires,
            pfs_supported: !!r.pfsSupported,
            vulnerabilities: r.vulnerabilities,
            self_signed: !!r.selfSigned,
            pqc_ready_score: r.pqcReadyScore || 0
        }));

        // call CBOM FastAPI (Python)
        const response = await axios.post("http://localhost:8000/cbom", {
            results: scannerResults
        });

        const cbomData = response.data;

        // Persist CBOM to Database
        const cbom = await Cbom.create({
            scanId: scanId,
            algorithms: cbomData.cbom.algorithms,
            keys: cbomData.cbom.keys,
            protocols: cbomData.cbom.protocols,
            certificates: cbomData.cbom.certificates
        });

        res.json({
            cbomId: cbom._id,
            cbom: cbom
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