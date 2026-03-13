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
Your task is to analyze TLS cryptographic configurations and produce accurate
post-quantum cryptography (PQC) migration recommendations.

------------------------------------------------------------
CRYPTOGRAPHIC FACTS
------------------------------------------------------------

1. Classical public-key algorithms are vulnerable to quantum attacks:
   - RSA
   - ECDSA
   - ECDH
   - X25519
   - X448

2. These algorithms are vulnerable to Shor's algorithm on a sufficiently
   large quantum computer.

3. TLS 1.3 improves security compared to older versions but is NOT
   quantum-safe because it relies on classical cryptography.

4. Current industry migration strategy is HYBRID TLS:
   Classical algorithm + Post-Quantum algorithm together.

5. NIST standardized PQC algorithms must be preferred.

------------------------------------------------------------
APPROVED POST-QUANTUM ALGORITHMS
------------------------------------------------------------

Key Exchange (KEM):
- ML-KEM-768

Digital Signatures:
- CRYSTALS-Dilithium
- Falcon
- SPHINCS+

------------------------------------------------------------
TLS CONFIGURATION TO ANALYZE
------------------------------------------------------------

TLS Version: ${scanResult.tlsVersion}
Cipher Suite: ${scanResult.cipher}
Key Exchange Algorithm: ${scanResult.keyExchange}
Signature Algorithm: ${scanResult.signatureAlgorithm}
Key Size: ${scanResult.keySize}
PQC Readiness Score: ${scanResult.pqcReadyScore}

------------------------------------------------------------
STRICT RULES (MUST FOLLOW)
------------------------------------------------------------

1. Output MUST be valid JSON only.
2. Do NOT include explanations.
3. Do NOT include markdown code blocks.
4. Do NOT include text before or after JSON.

5. "risk_level" MUST be one of:
LOW
MEDIUM
HIGH

Risk rules:

HIGH
- TLS version lower than TLS 1.2
- RSA key exchange
- weak key sizes

MEDIUM
- TLS 1.2 or TLS 1.3 using classical algorithms
- X25519 key exchange
- RSA signatures
- ECDSA signatures

LOW
- Hybrid PQC configuration detected

6. Do NOT claim TLS 1.3 is quantum safe.

7. Only recommend these PQC algorithms:

Key Exchange:
ML-KEM-768

Signatures:
CRYSTALS-Dilithium
Falcon
SPHINCS+

8. "migration_steps" must contain exactly 3 steps.

------------------------------------------------------------
RESPONSE FORMAT
------------------------------------------------------------

{
  "risk_level": "LOW | MEDIUM | HIGH",
  "recommendations": "Brief explanation of quantum risk",
  "migration_steps": [
    "step 1",
    "step 2",
    "step 3"
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
        temperature: 0.2,
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