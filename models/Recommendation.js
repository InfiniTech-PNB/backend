/**
 * @typedef {Object} Recommendation
 * @description Asset-specific PQC migration recommendations.
 * @property {ObjectId} scanResultId - Reference to the specific scan result.
 * @property {string} host - Hostname of the asset.
 * @property {number} pqcScore - Quantum readiness score (0-1).
 * @property {string} riskLevel - Risk classification (LOW/MEDIUM/HIGH).
 * @property {string} recommendations - Human-readable explanation of the risk.
 * @property {Array<string>} migrationSteps - Concrete steps for PQC migration.
 * @property {string} recommendedPqcKex - Suggested Post-Quantum Key Exchange.
 * @property {string} recommendedPqcSignature - Suggested Post-Quantum Signature.
 */

const mongoose = require("mongoose");

const RecommendationSchema = new mongoose.Schema({
  scanResultId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ScanResult",
    required: true
  },

  host: String,

  pqcScore: Number,

  riskLevel: {
    type: String,
    enum: ["LOW", "MEDIUM", "HIGH"]
  },

  recommendations: String,

  migrationSteps: [String],

  recommendedPqcKex: String,

  recommendedPqcSignature: String,

  generatedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("Recommendation", RecommendationSchema);