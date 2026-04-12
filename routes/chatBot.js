/**
 * @file chatBot.js
 * @description These routes power our AI-driven "Cryptographic Consultant". 
 * It takes your technical scan data and makes it understandable, providing strategic 
 * advice on how to fix vulnerabilities and migrate to Post-Quantum Cryptography.
 */

const express = require("express");
const router = express.Router();
const authMiddleware = require("../middlewares/authMiddleware");
const Scan = require("../models/Scan");
const ScanResult = require("../models/ScanResult");
const Asset = require("../models/Asset");
const axios = require("axios");
const { handleUserQuery } = require("../services/generateChatPrompt");
const Domain = require("../models/Domain");
const Chat = require("../models/Chat");
require("dotenv").config();

router.use(authMiddleware);
//ask a question
/**
 * @route POST /api/chat-bot/chat
 * @description Ask the AI auditor a question about your domain's scan results.
 * The AI has "complete knowledge" of your latest scan results and will answer 
 * using only that data – no guessing allowed.
 * 
 * ---
 * INPUT EXAMPLE:
 * Body: {
 *   "scanId": "67c8...",
 *   "question": "Which of my assets are still using TLS 1.2?"
 * }
 * 
 * ---
 * OUTPUT EXAMPLE:
 * {
 *   "answer": "Based on the scan, 3 assets (api.example.com, dev.test, etc.) are using TLS 1.2. We recommend upgrading to TLS 1.3 for better security.",
 *   "chatId": "69c6..."
 * }
 */
router.post("/chat", async (req, res) => {
  try {

    const { scanId, question } = req.body;

    if (!scanId || !question) {
      return res.status(400).json({
        message: "scanId and question are required"
      });
    }

    const scan = await Scan.findById(scanId);

    if (!scan) {
      return res.status(404).json({
        message: "Scan not found"
      });
    }

    const domain = await Domain.findById(scan.domainId);

    if (!domain) {
      return res.status(404).json({
        message: "Domain not found"
      });
    }

    const scanResults = await ScanResult
      .find({ scanId })
      .populate("assetId");

    if (!scanResults || scanResults.length === 0) {
      return res.status(404).json({
        message: "No scan results found for this scan job."
      });
    }

    const totalAssets = await Asset.countDocuments({ domainId: domain._id });
    const totalScannedAssets = scanResults.length;

    let pqcReady = 0;
    let migrationReady = 0;
    let legacyCrypto = 0;
    let weakCipherAssets = 0;
    let tlsVersions = {};
    let totalScore = 0;
    const algorithms = new Set();

    scanResults.forEach(r => {
      const score = r.pqcReadyScore || 0;
      totalScore += score;

      if (score >= 0.9) pqcReady++;
      else if (score >= 0.4) migrationReady++;
      else legacyCrypto++;

      if (r.weakCiphers && r.weakCiphers.length > 0) weakCipherAssets++;

      if (r.negotiated?.tlsVersion) {
        tlsVersions[r.negotiated.tlsVersion] = (tlsVersions[r.negotiated.tlsVersion] || 0) + 1;
      }

      if (r.negotiated?.keyExchange) algorithms.add(r.negotiated.keyExchange);
      if (r.certificate?.signatureAlgorithm) algorithms.add(r.certificate.signatureAlgorithm);
      if (r.negotiated?.cipher) algorithms.add(r.negotiated.cipher);
    });

    const context = {
      domainSummary: {
        domainName: domain.domainName,
        totalAssets,
        totalScannedAssets,
        pqcReadiness: {
          pqcReadyAssets: pqcReady,
          migrationReadyAssets: migrationReady,
          legacyCryptoAssets: legacyCrypto,
          averagePqcScore: totalScannedAssets > 0 ? (totalScore / totalScannedAssets).toFixed(2) : 0
        },
        risks: {
          weakCipherAssets,
          vulnerableAssets: legacyCrypto
        },
        tlsDistribution: tlsVersions,
        uniqueAlgorithms: Array.from(algorithms)
      },
      assetResults: scanResults.map(r => ({
        host: r.host,
        ip: r.ip,
        port: r.port,
        protocol: r.protocol,
        negotiated: r.negotiated,
        certificate: {
          subject: r.certificate?.subject,
          issuer: r.certificate?.issuer,
          signatureAlgorithm: r.certificate?.signatureAlgorithm,
          publicKey: r.certificate?.publicKey
        },
        weakCiphers: r.weakCiphers,
        vulnerabilities: r.vulnerabilities,
        pqcReadyScore: r.pqcReadyScore
      }))
    };

    const response = await handleUserQuery(context, question, async (prompt) => {
    const llmResponse = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama-3.1-8b-instant",
        messages: [
          {
            role: "system",
            content: "You are a cybersecurity assistant. Follow the instructions in the user prompt strictly."
          },
          {
            role: "user",
            content: prompt
          }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    return llmResponse.data.choices[0].message.content;
  });

    const answer = response;

    // Save chat in DB
    const chat = await Chat.create({
      scanId,
      question,
      answer,
      askedBy: req.user?._id || null
    });

    res.json({
      question,
      answer,
      chatId: chat._id
    });

  } catch (error) {

    console.error("Chat error:", error);

    res.status(500).json({
      message: "Internal server error"
    });

  }
});

//get all chats for a scan
/**
 * @route GET /api/chat-bot/:scanId
 * @description Retrieves all previous audit conversations for a specific scan session.
 */
router.get("/:scanId", async (req, res) => {
  try {
    const { scanId } = req.params;

    const chats = await Chat.find({ scanId })
      .sort({ createdAt: 1 })
      .populate("askedBy", "name email");

    res.json(chats);
  } catch (error) {
    console.error("Chat error:", error);
    res.status(500).json({
      message: "Internal server error"
    });
  }
});
module.exports = router;