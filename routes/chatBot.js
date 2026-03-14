const express = require("express");
const router = express.Router();
const authMiddleware = require("../middlewares/authMiddleware");
const Scan = require("../models/Scan");
const ScanResult = require("../models/ScanResult");
const axios = require("axios");
const buildStrictPrompt = require("../services/generateChatPrompt");
const Domain = require("../models/Domain");
const Chat = require("../models/ChatBot");
require("dotenv").config();


router.use(authMiddleware);
//ask a question
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

    if (!scanResults.length) {
      return res.status(404).json({
        message: "Scan results not found"
      });
    }

    const context = scanResults.map(r => ({
      assetName: r.assetId.host,
      domainName: domain.domainName,
      port: r.port,
      protocol: r.protocol,
      tlsVersion: r.tlsVersion,
      cipher: r.cipher,
      keyExchange: r.keyExchange,
      signatureAlgorithm: r.signatureAlgorithm,
      keySize: r.keySize,
      weakCiphers: r.weakCiphers,
      vulnerabilities: r.vulnerabilities,
      pqcReadyScore: r.pqcReadyScore
    }));

    const prompt = buildStrictPrompt(context, question);

    const llmResponse = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama-3.1-8b-instant",
        messages: [
          {
            role: "system",
            content: "You are a cybersecurity TLS analysis assistant."
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

    const answer = llmResponse.data.choices[0].message.content;

    // Save chat in DB
    const chat = await Chat.create({
      scanId,
      question,
      answer,
      askedBy: req.user._id
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