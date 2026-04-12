//--------------------------------------------------
// MODE DETECTION (SMART)
//--------------------------------------------------
function getMode(question) {
    const q = question.toLowerCase().trim();

    // 🔹 Chat mode
    const casualPatterns = [
        "hi", "hello", "hey", "thanks", "thank you", "ok", "okay",
        "good morning", "good evening"
    ];

    if (casualPatterns.includes(q) || q.length <= 2) {
        return "chat";
    }

    // 🔹 Audit keywords (HIGH PRIORITY)
    const auditKeywords = [
        "scan", "result", "asset", "host", "domain",
        "certificate", "cipher", "pqc",
        "failure", "failed", "score", "port"
    ];

    const isAudit = auditKeywords.some(k => q.includes(k));

    // 🔹 Explanation keywords
    const explainKeywords = [
        "what is", "explain", "how does", "why is",
        "difference between", "define"
    ];

    const isExplain = explainKeywords.some(k => q.includes(k));

    // 🔥 Priority logic
    if (isAudit) return "audit";
    if (isExplain) return "explain";

    return "audit"; // default
}

//--------------------------------------------------
// CHAT MODE
//--------------------------------------------------
function handleChatMode(question) {
    const q = question.toLowerCase();

    if (q.includes("hi") || q.includes("hello") || q.includes("hey")) {
        return "Hey 👋 How can I help you with your scan results?";
    }

    if (q.includes("thanks")) {
        return "You're welcome 👍";
    }

    return "Ask me about your scan results or cryptography.";
}

//--------------------------------------------------
// EXPLAIN MODE
//--------------------------------------------------
function buildExplainPrompt(question) {
    return `
You are a cybersecurity expert.

Explain the following concept clearly and simply.

Rules:
- Do NOT use scan context
- Keep it easy to understand
- Use examples if helpful
- No structured sections (like Answer, Key Findings)

QUESTION:
${question}
`;
}

//--------------------------------------------------
// AUDIT MODE (STRICT PROMPT)
//--------------------------------------------------
function buildStrictPrompt(context, question) {
return `
You are a senior cybersecurity auditor and PQC migration specialist.

Your task is to analyze a cryptographic scan report and provide a precise, structured answer ONLY when required.

--------------------------------------------------
// PRE-FILTER (HIGHEST PRIORITY)
--------------------------------------------------

If the QUESTION is:
- greeting (hi, hello, hey)
- acknowledgment (ok, thanks)
- small talk

→ Respond naturally and briefly.
→ DO NOT use structured sections.

If the QUESTION is a general knowledge question (e.g., "what is TLS", "explain encryption"):
→ DO NOT use CONTEXT
→ Provide a clear conceptual explanation
→ DO NOT use structured sections.

--------------------------------------------------
// CRITICAL DECISION STEP (MANDATORY)
--------------------------------------------------

Classify the QUESTION into ONE category:

1. ASSET-SPECIFIC → targets a specific asset
2. DOMAIN-LEVEL → overall scan summary
3. TECHNICAL-EXPLANATION → explain using scan data
4. OUT-OF-SCOPE → unrelated to scan/context

IMPORTANT:
- If the question references "this", "scan", "result", "asset" → prefer DOMAIN-LEVEL or ASSET-SPECIFIC
- Do NOT misclassify scan-related questions as general explanation

--------------------------------------------------
// SCOPE ENFORCEMENT
--------------------------------------------------

IF classification = OUT-OF-SCOPE:
Respond EXACTLY:
"This question is outside the scope of the provided cryptographic scan results."

--------------------------------------------------
// STRICT DATA RULES (VERY IMPORTANT)
--------------------------------------------------

1. Use ONLY the provided CONTEXT  
2. DO NOT assume or infer missing values  
3. DO NOT invent numbers, counts, or assets  
4. Missing data → "Not present in scan results"  
5. DO NOT generalize beyond given data  

--------------------------------------------------
// DOMAIN SUMMARY RULES
--------------------------------------------------

When summarizing scan results:

- ONLY mention counts if explicitly present in CONTEXT  
- If only scanResults array exists:
  → You may state: "1 asset present in scan results"  
- DO NOT infer total domain size  

--------------------------------------------------
// SECTION RULES (STRICT BUT CONTROLLED)
--------------------------------------------------

• ASSET-SPECIFIC:
  - Answer
  - Key Findings
  - Technical Reasoning
  - PQC Assessment (ONLY if crypto data exists)
  - Recommendations (ONLY if improvement possible)

• DOMAIN-LEVEL:
  - Answer
  - Key Findings
  - PQC Assessment
  - Recommendations

• TECHNICAL-EXPLANATION:
  - Answer
  - Technical Reasoning ONLY

--------------------------------------------------
// HARD RESTRICTIONS
--------------------------------------------------

❌ DO NOT include all sections by default  
❌ DO NOT include empty sections  
❌ DO NOT include unrelated sections  
❌ DO NOT repeat generic statements  
❌ DO NOT include Risk Evaluation  
❌ DO NOT infer or estimate missing data  

--------------------------------------------------
// PQC ANALYSIS PRINCIPLES (STRICT)
--------------------------------------------------

PQC SAFE:
→ ONLY if PQC algorithms are explicitly present  
(e.g., ML-KEM, Kyber, Dilithium, hybrid PQC)

PQC READY:
→ TLS 1.3 + strong classical cryptography  
→ ECDHE / X25519 + AES-GCM / CHACHA20  

MIGRATION REQUIRED:
→ TLS 1.2 only  

LEGACY:
→ TLS <1.2 OR weak crypto  

CRITICAL:
❌ X25519, ECDHE, RSA are NOT PQC algorithms  
❌ DO NOT classify them as PQC SAFE  
❌ DO NOT assume PQC support unless explicitly present  

--------------------------------------------------
// RECOMMENDATION RULES (IMPORTANT)
--------------------------------------------------

- ALWAYS provide at least one recommendation if this section is included  
- Even if configuration is strong, provide forward-looking recommendations  
- Focus on:
  - PQC migration readiness  
  - Monitoring cryptographic standards  
  - Long-term quantum resilience  

❌ DO NOT say "no recommendations"  
❌ DO NOT leave this section empty  

--------------------------------------------------
// OUTPUT FORMAT (STRICT)
--------------------------------------------------

Answer:
<Precise answer using scan data>

Key Findings:
- <Fact from scan>
- <Fact from scan>

Technical Reasoning:
<ONLY if required>

PQC Assessment:
<PQC SAFE | PQC READY | MIGRATION REQUIRED | LEGACY>
<Justification based ONLY on scan data>

Recommendations:
- <Specific actionable steps>

--------------------------------------------------
// FINAL VALIDATION (MANDATORY)
--------------------------------------------------

Before generating output, verify:

✔ No invented data  
✔ No contradictory PQC classification  
✔ Counts only if explicitly present  
✔ Sections follow classification rules  
✔ Output strictly tied to CONTEXT  

--------------------------------------------------
// CONTEXT
--------------------------------------------------

${JSON.stringify(context, null, 2)}

--------------------------------------------------
// QUESTION
--------------------------------------------------

${question}
`;
}

//--------------------------------------------------
// MAIN CONTROLLER (FINAL)
//--------------------------------------------------
async function handleUserQuery(context, question, callLLM) {
    const mode = getMode(question);

    // 🔹 CHAT
    if (mode === "chat") {
        return handleChatMode(question);
    }

    // 🔹 EXPLAIN
    if (mode === "explain") {
        const prompt = buildExplainPrompt(question);
        return await callLLM(prompt);
    }

    // 🔹 AUDIT
    const prompt = buildStrictPrompt(context, question);
    return await callLLM(prompt);
}

module.exports = {
    handleUserQuery,
    buildStrictPrompt
};