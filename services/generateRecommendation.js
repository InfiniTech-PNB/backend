/**
 * @module generateRecommendation
 * @description Logic for generating asset-specific PQC migration recommendations using LLM (Groq/Llama).
 * Analyzes specific TLS configurations and returns structured JSON advice.
 */

const axios = require("axios");
require("dotenv").config();

/*
Extract JSON from LLM response
Handles cases where model returns markdown or explanations
*/
function extractJSON(text) {
  const match = text.match(/\{[\s\S]*\}/);
  return match ? match[0] : null;
}

/*
Ensure risk level matches schema enum
*/
function sanitizeRisk(risk) {
  const allowed = ["LOW", "MEDIUM", "HIGH"];
  if (!risk) return "MEDIUM";

  const upper = risk.toUpperCase().trim();

  return allowed.includes(upper) ? upper : "MEDIUM";
}

async function generateRecommendation(scanResult) {

  const prompt = `
SYSTEM ROLE:
You are a senior cryptography auditor and post-quantum migration specialist.

Your task is to generate PRECISE, NON-GENERIC, ASSET-SPECIFIC PQC migration recommendations.

You MUST tailor your response based strictly on the provided TLS configuration.
Avoid generic or repetitive recommendations.

------------------------------------------------------------
CRITICAL INSTRUCTION (ANTI-REPETITION)
------------------------------------------------------------

- DO NOT produce generic recommendations.
- DO NOT repeat the same explanation across different inputs.
- Your response MUST explicitly reference:
  - TLS version
  - Cipher suite
  - Key exchange
  - Signature algorithm
  - Key size

- If two inputs differ, the recommendation MUST differ.

------------------------------------------------------------
CRYPTOGRAPHIC FACTS
------------------------------------------------------------

- RSA, ECDSA, ECDH, X25519, X448 → vulnerable to quantum attacks
- TLS 1.3 is NOT quantum-safe
- Hybrid PQC = current best practice

------------------------------------------------------------
APPROVED PQC ALGORITHMS
------------------------------------------------------------

Key Exchange:
ML-KEM-768

Signatures:
CRYSTALS-Dilithium
Falcon
SPHINCS+

------------------------------------------------------------
INPUT (STRICTLY ANALYZE)
------------------------------------------------------------

TLS Version: ${scanResult.negotiated?.tlsVersion || "Unknown"}
Cipher Suite: ${scanResult.negotiated?.cipher || "Unknown"}
Key Exchange: ${scanResult.negotiated?.keyExchange || "Unknown"}
Signature Algorithm: ${scanResult.certificate?.signatureAlgorithm || "Unknown"}
Key Size: ${scanResult.certificate?.publicKey?.size || "Unknown"}
PQC Score: ${scanResult.pqcReadyScore || 0}

------------------------------------------------------------
RISK CLASSIFICATION LOGIC
------------------------------------------------------------

HIGH:
- TLS < 1.2
- RSA key exchange
- Key size < 2048

MEDIUM:
- TLS 1.2 / 1.3 with classical crypto
- X25519 / ECDHE
- RSA / ECDSA signatures

LOW:
- Hybrid PQC present

------------------------------------------------------------
RESPONSE REQUIREMENTS
------------------------------------------------------------

- Output MUST be valid JSON only
- No markdown, no explanation outside JSON
- "migration_steps" MUST be exactly 3 steps

- Recommendations MUST:
  ✔ Mention specific weaknesses from input
  ✔ Be technically different depending on configuration
  ✔ Not be generic phrases like "upgrade to PQC" only

------------------------------------------------------------
RESPONSE FORMAT
------------------------------------------------------------

{
  "risk_level": "LOW | MEDIUM | HIGH",
  "recommendations": "Asset-specific explanation referencing TLS version, cipher, and algorithms",
  "migration_steps": [
    "step 1 tailored to configuration",
    "step 2 tailored to configuration",
    "step 3 tailored to configuration"
  ],
  "recommended_pqc_kex": "ML-KEM-768",
  "recommended_pqc_signature": "CRYSTALS-Dilithium"
}

If the recommendation is similar to a generic template, REWRITE it to include specific technical reasoning.
`;

  try {

    const response = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama-3.1-8b-instant",
        temperature: 0.5,
        messages: [
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

    const text = response.data.choices[0].message.content;

    const jsonText = extractJSON(text);

    if (!jsonText) {
      throw new Error("LLM returned no JSON");
    }

    const parsed = JSON.parse(jsonText);

    return {
      risk_level: sanitizeRisk(parsed.risk_level),
      recommendations: parsed.recommendations || "",
      migration_steps: parsed.migration_steps || [],
      recommended_pqc_kex: parsed.recommended_pqc_kex || "ML-KEM-768",
      recommended_pqc_signature:
        parsed.recommended_pqc_signature || "CRYSTALS-Dilithium"
    };

  } catch (err) {

    console.error("LLM recommendation error:", err.message);

    return {
      risk_level: "MEDIUM",
      recommendations:
        "Automatic PQC analysis failed. Classical cryptography detected. Migration toward hybrid PQC TLS is recommended.",
      migration_steps: [],
      recommended_pqc_kex: "ML-KEM-768",
      recommended_pqc_signature: "CRYSTALS-Dilithium"
    };

  }
}

module.exports = generateRecommendation;