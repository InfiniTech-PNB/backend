/**
 * @typedef {Object} DomainRecommendation
 * @description High-level PQC migration recommendations for an entire domain.
 * @property {ObjectId} domainId - Reference to the target Domain.
 * @property {ObjectId} scanId - Reference to the scan used to generate this recommendation.
 * @property {string} riskLevel - Overall quantum risk level (LOW/MEDIUM/HIGH).
 * @property {string} summary - Brief explanation of the domain's cryptographic posture.
 * @property {Array<string>} migrationStrategy - List of steps to migrate the domain to PQC.
 * @property {string} recommendedPqcKex - Suggested Post-Quantum Key Exchange algorithm.
 * @property {string} recommendedPqcSignature - Suggested Post-Quantum Signature algorithm.
 */

const mongoose = require("mongoose");

const DomainRecommendationSchema = new mongoose.Schema({
  domainId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Domain",
    required: true
  },
  scanId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Scan"
  },
  riskLevel: String,
  summary: String,
  migrationStrategy: [String],
  recommendedPqcKex: String,
  recommendedPqcSignature: String,
  generatedAt: {
    type: Date,
    default: Date.now
  }
});
module.exports = mongoose.model("DomainRecommendation", DomainRecommendationSchema);