const axios = require("axios");
require("dotenv").config();

async function generateScore(mlScore, result) {
    const prompt = `You are a deterministic Post-Quantum Cryptography (PQC) normalization engine.
Your behavior must be rigid, rule-bound, and non-creative.
ABSOLUTE EXECUTION CONSTRAINTS
You MUST operate only on the provided input.
You MUST NOT assume, infer, or hallucinate missing data.
You MUST NOT use external knowledge beyond the rules defined here.
You MUST NOT explain, justify, or describe anything.
You MUST NOT output JSON, text, labels, or formatting.
You MUST output EXACTLY one numeric value.
Output MUST be a float between 0 and 1.
Output MUST contain NO extra spaces, NO newline before or after.
If uncertain, default to conservative (lower) score adjustment.
If input is insufficient, still return a valid constrained score (never fail).

CRYPTOGRAPHIC CLASSIFICATION RULES (STRICT)
Treat findings ONLY as follows:

Quantum Vulnerable Algorithms:
RSA
ECDSA
ECDHE
X25519
X448

Safe (Symmetric):
AES
ChaCha20

Protocol:
TLS 1.3 → strong baseline
TLS < 1.3 → weaker baseline

PQC Classification:
No PQC present → classical only
Hybrid PQC present → partial mitigation
Full PQC present → strong mitigation
Weakness Indicators:
Weak ciphers
Deprecated protocols
Misconfigurations

NORMALIZATION LOGIC (STRICT & ORDERED)
Apply rules in this EXACT order:

STEP 1 — Base Validation
Ensure output remains within [0, 1]

STEP 2 — Classical Crypto Constraint
If ONLY classical crypto is present:
→ score MUST be < 0.90

STEP 3 — No PQC Constraint
If NO PQC or hybrid PQC is present:
→ score MUST NOT exceed 0.90

STEP 4 — TLS Evaluation
If TLS 1.3 present AND no weaknesses:
→ keep score high BUT strictly < 0.90

STEP 5 — Weakness Penalty
If ANY weak cipher or issue exists:
→ reduce score proportionally (minimum noticeable reduction required)

STEP 6 — Hybrid PQC Adjustment
If hybrid PQC exists:
→ score MUST be within [0.85, 0.95]

STEP 7 — Full PQC Adjustment
If full PQC exists:
→ score MAY approach 1.0 but must respect ±0.10 rule

STEP 8 — ML Score Deviation Constraint
Final score MUST NOT differ from ML score by more than ±0.10

STEP 9 — Stability Rule
If ML score already satisfies ALL constraints:
→ DO NOT modify it

STEP 10 — Conflict Resolution
If rules conflict:
→ prioritize in this order:
Classical/PQC constraints
Weakness penalties
TLS evaluation
ML deviation constraint

STEP 11 — Classification Mapping (MANDATORY, NON-OUTPUT)
Map the FINAL normalized score to one of the following internal classifications:
0.0 - 0.4  → Quantum Vulnerable  
0.4 - 0.7  → Migration Required  
0.7 - 0.9  → PQC Ready  
0.9 - 1.0  → Quantum Safe  
This classification is for internal validation ONLY.
STRICT CONSTRAINTS:
• If NO PQC or hybrid PQC is present:
  → classification MUST NOT be "Quantum Safe"
• If ONLY classical cryptography is present:
  → classification MUST NOT be "Quantum Safe"
• If classification would violate the above:
  → adjust score downward within ±0.10 constraint
• Ensure score and classification are consistent
IMPORTANT:
This classification MUST NOT be printed.
It is only used to validate the score internally.

FAIL-SAFE RULES
NEVER output invalid format
NEVER exceed bounds
NEVER skip constraints
NEVER produce multiple values
ALWAYS return a valid float

INPUT
ML Score:
${mlScore}

Scan Results:
${result}

OUTPUT
Return ONLY the normalized score
Example:
0.87
(No text, no explanation, no formatting)`
        ;

    try {
        const response = await axios.post(
            "https://api.groq.com/openai/v1/chat/completions",
            {
                model: "llama-3.1-8b-instant",
                temperature: 0,
                max_tokens: 5,
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
        const raw = response.data.choices[0].message.content.trim();
        console.log("raw", raw);
        const normalizedScore = parseFloat(raw.split("\n")[0]);
        console.log("normalizedScore", normalizedScore);
        return normalizedScore;
    } catch (error) {
        console.error("Error generating score:", error);
        throw error;
    }
};

module.exports = generateScore;