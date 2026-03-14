// scoring.js

// -----------------------------
// Map Asset Criticality
// -----------------------------
function mapAssetCriticality(level) {
    const mapping = {
        Low: 0,
        Medium: 3,
        High: 6,
        Critical: 9,
    };

    return mapping[level] ?? 3;
}

// -----------------------------
// Normalize number to 0–10
// -----------------------------
function clamp10(val) {
    if (val < 0) return 0;
    if (val > 10) return 10;
    return val;
}

// -----------------------------
// Compute Environmental Score
// -----------------------------
function computeEnvScore(inputs) {

    // expected inputs:
    // assetCriticality
    // confidentiality
    // integrity
    // availability
    // sla
    // patchDifficulty
    // dependentServices

    const assetCrit = mapAssetCriticality(inputs.assetCriticality ?? 0);

    const conf = clamp10(inputs.confidentialityWeight ?? 5);
    const integ = clamp10(inputs.integrityWeight ?? 5);
    const avail = clamp10(inputs.availabilityWeight ?? 5);

    const sla = clamp10(inputs.slaRequirement ?? 5);

    const patch = clamp10(inputs.remediationDifficulty ?? 5);

    let deps = inputs.dependentServices ?? 0;
    if (deps > 10) deps = 10;

    // CIA average
    const ciaAvg = (conf + integ + avail) / 3;

    // weights (must sum ~1)
    const wAsset = 0.30;
    const wCIA = 0.25;
    const wSLA = 0.15;
    const wPatch = 0.15;
    const wDeps = 0.15;

    // weighted sum (0–10 scale)
    const score0to10 =
        wAsset * assetCrit +
        wCIA * ciaAvg +
        wSLA * sla +
        wPatch * patch +
        wDeps * deps;

    // normalize to 0–1
    let envScore = score0to10 / 10;

    if (envScore < 0) envScore = 0;
    if (envScore > 1) envScore = 1;

    return envScore;
}


// -----------------------------
// Combine ML score + Env score
// -----------------------------
function combineScores(mlScore, envScore) {

    // weights
    const alpha = 0.9; // ML
    const beta = 0.1;  // admin

    let finalScore = alpha * mlScore + beta * envScore;

    if (finalScore < 0) finalScore = 0;
    if (finalScore > 1) finalScore = 1;

    return finalScore;
}


// -----------------------------
// Export functions
// -----------------------------
module.exports = {
    computeEnvScore,
    combineScores
};