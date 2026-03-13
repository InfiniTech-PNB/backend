/**
 * @module generateDomainRecommendation
 * @description Logic for generating high-level PQC migration strategies for a domain using LLM (Groq/Llama).
 */

const axios = require("axios");
require("dotenv").config();

/**
 * Generates PQC migration recommendations for an entire domain based on aggregated scan results.
 * @async
 * @param {Object} summary - Aggregated domain summary (asset counts, risk levels, TLS distribution, etc.).
 * @returns {Promise<Object>} - LLM-generated recommendation containing risk_level, summary, and migration_strategy.
 */
async function generateDomainRecommendation(summary) {

  const prompt = `
SYSTEM ROLE

You are a senior cryptography auditor and Post-Quantum Cryptography (PQC) migration specialist.

Your task is to analyze the cryptographic posture of a domain and produce a technically accurate PQC migration recommendation.

You MUST strictly follow the rules and facts below.


------------------------------------------------------------
MANDATORY CRYPTOGRAPHIC FACTS
------------------------------------------------------------

1. Classical public-key cryptography is vulnerable to quantum attacks due to Shor's algorithm.

2. The following algorithms are NOT quantum-safe:

RSA
ECDSA
ECDH
X25519
X448

3. TLS 1.3 improves security but is NOT quantum-safe because it still relies on classical key exchange and signatures.

4. A system is considered PQC-READY only when hybrid PQC cryptography is deployed.

Hybrid TLS = Classical algorithm + Post-Quantum algorithm.


------------------------------------------------------------
NIST APPROVED POST-QUANTUM ALGORITHMS
------------------------------------------------------------

You are ONLY allowed to recommend algorithms from this list.

Key Exchange (KEM)
ML-KEM-768 (Kyber)

Digital Signatures
CRYSTALS-Dilithium
Falcon
SPHINCS+

If any other algorithm is suggested, the answer is considered INVALID.

The following algorithms MUST NEVER appear in the output:

NewHope
FrodoKEM
SIKE
BIKE
any experimental PQC algorithm


------------------------------------------------------------
DOMAIN CRYPTOGRAPHIC SUMMARY
------------------------------------------------------------

Domain: ${summary.domain}

Total Assets: ${summary.assets.total_assets}
Scanned Assets: ${summary.assets.scanned_assets}

PQC Ready Assets: ${summary.pqc_readiness.pqc_ready_assets}
Migration Ready Assets: ${summary.pqc_readiness.migration_ready_assets}
Legacy Crypto Assets: ${summary.pqc_readiness.legacy_crypto_assets}

Average PQC Score: ${summary.pqc_readiness.average_score}

Weak Cipher Instances: ${summary.risks.weak_cipher_assets}

TLS Version Distribution:

${Object.entries(summary.tls_distribution)
  .map(([k, v]) => `${k}: ${v}`)
  .join("\n")}


------------------------------------------------------------
RISK CLASSIFICATION RULES
------------------------------------------------------------

You MUST compute the risk level using the following deterministic rules.

HIGH risk if:

- TLS 1.0 or TLS 1.1 detected
OR
- weak ciphers detected
OR
- majority of assets use legacy cryptography
OR
- average PQC score < 0.3


MEDIUM risk if:

- TLS 1.2 or TLS 1.3 only
AND
- classical cryptography is used
AND
- no PQC deployment detected


LOW risk if:

- hybrid PQC cryptography detected
OR
- PQC ready assets exist


------------------------------------------------------------
TASK
------------------------------------------------------------

1. Evaluate the domain's quantum-security posture.
2. Determine the correct risk level using the rules above.
3. Provide a concise explanation of PQC readiness.
4. Suggest practical TLS migration steps.
5. Recommend NIST PQC algorithms.


------------------------------------------------------------
OUTPUT RULES
------------------------------------------------------------

You MUST follow these rules strictly.

1. Output MUST be valid JSON only.
2. Do NOT include markdown.
3. Do NOT include explanations outside JSON.
4. Do NOT include extra text.
5. Risk level MUST be exactly one of:

LOW
MEDIUM
HIGH

6. Algorithms MUST come ONLY from the approved NIST list.


------------------------------------------------------------
RESPONSE FORMAT
------------------------------------------------------------

{
  "risk_level": "LOW | MEDIUM | HIGH",
  "summary": "short technical explanation",
  "migration_strategy": [
    "step 1",
    "step 2",
    "step 3"
  ],
  "recommended_pqc_kex": "ML-KEM-768",
  "recommended_pqc_signature": "CRYSTALS-Dilithium"
}
`;

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

  const data = await response.data;

  return JSON.parse(data.choices[0].message.content);
}

module.exports = generateDomainRecommendation;