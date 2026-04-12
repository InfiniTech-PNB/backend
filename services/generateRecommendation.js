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

Your task is to generate STRICTLY ASSET-SPECIFIC PQC migration recommendations.

------------------------------------------------------------
CRITICAL ENFORCEMENT RULES (MANDATORY)
------------------------------------------------------------

1. You MUST use ONLY the provided input values
2. You MUST NOT assume missing data
3. Missing data → "Not present in scan results"

4. You MUST explicitly reference ALL:
   - TLS version
   - Cipher suite
   - Key exchange
   - Signature algorithm
   - Key size

------------------------------------------------------------
ANTI-GENERIC ENFORCEMENT
------------------------------------------------------------

❌ DO NOT give generic advice like:
- "improve security"
- "upgrade encryption"
- "use PQC"

✔ EACH recommendation MUST:
- Point to a specific weakness
- Be derived from input values
- Change if input changes

------------------------------------------------------------
INPUT (STRICT SOURCE OF TRUTH)
------------------------------------------------------------

TLS Version: ${scanResult.negotiated?.tlsVersion || "Unknown"}
Cipher Suite: ${scanResult.negotiated?.cipher || "Unknown"}
Key Exchange: ${scanResult.negotiated?.keyExchange || "Unknown"}
Signature Algorithm: ${scanResult.certificate?.signatureAlgorithm || "Unknown"}
Key Size: ${scanResult.certificate?.publicKey?.size || "Unknown"}
PQC Score: ${scanResult.pqcReadyScore || 0}

------------------------------------------------------------
WEAKNESS MAPPING RULES (MANDATORY)
------------------------------------------------------------

- TLS <1.2 → obsolete protocol
- TLS 1.2 → lacks modern features
- TLS 1.3 → strong but not quantum-safe

- RSA key exchange → no forward secrecy
- ECDH/ECDHE/X25519 → quantum vulnerable

- RSA/ECDSA signatures → quantum vulnerable

- Key size <2048 → weak key

------------------------------------------------------------
RECOMMENDATION LOGIC (STRICT)
------------------------------------------------------------

You MUST:

1. Identify exact weaknesses
2. Explain them technically
3. Provide corrective steps

Each migration step MUST:
- Directly fix a weakness
- Be actionable
- Be configuration-specific

------------------------------------------------------------
ALLOWED PQC ALGORITHMS
------------------------------------------------------------

Key Exchange:
ML-KEM-768

Signatures:
CRYSTALS-Dilithium
Falcon
SPHINCS+

------------------------------------------------------------
HARD RESTRICTIONS
------------------------------------------------------------

❌ DO NOT include risk level
❌ DO NOT estimate risk
❌ DO NOT use words like: high risk, low risk, vulnerable risk score

------------------------------------------------------------
OUTPUT RULES
------------------------------------------------------------

- Output MUST be valid JSON only
- No markdown
- No extra text
- "migration_steps" MUST be exactly 3

------------------------------------------------------------
RESPONSE FORMAT
------------------------------------------------------------

{
  "recommendations": "Technical explanation referencing TLS, cipher, key exchange, signature, and key size",
  "migration_steps": [
    "step 1 tied to weakness",
    "step 2 tied to weakness",
    "step 3 tied to weakness"
  ],
  "recommended_pqc_kex": "ML-KEM-768",
  "recommended_pqc_signature": "CRYSTALS-Dilithium"
}
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
      recommendations: parsed.recommendations || "",
      migration_steps: parsed.migration_steps || [],
      recommended_pqc_kex: parsed.recommended_pqc_kex || "ML-KEM-768",
      recommended_pqc_signature:
        parsed.recommended_pqc_signature || "CRYSTALS-Dilithium"
    };

  } catch (err) {

    console.error("LLM recommendation error:", err.message);

    return {
      recommendations:
        "Automatic PQC analysis failed. Classical cryptography detected. Migration toward hybrid PQC TLS is recommended.",
      migration_steps: [],
      recommended_pqc_kex: "ML-KEM-768",
      recommended_pqc_signature: "CRYSTALS-Dilithium"
    };

  }
}

module.exports = generateRecommendation;