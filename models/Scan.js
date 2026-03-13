/**
 * @typedef {Object} Scan
 * @description Represents a cryptographic scanning job.
 * @property {ObjectId} domainId - Reference to the target Domain.
 * @property {string} scanType - Type of scan (soft/deep).
 * @property {Array<ObjectId>} assets - List of individual Assets targeted in this scan.
 * @property {string} status - Job status (pending, completed, failed, etc.).
 * @property {Date} startedAt - When the scan job was initiated.
 * @property {Date} completedAt - When the scan job finished.
 */

const mongoose = require("mongoose");

const ScanSchema = new mongoose.Schema({
  domainId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Domain",
    required: true
  },

  scanType: {
    type: String,
    enum: ["soft", "deep"],
    default: "soft"
  },

  assets: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "Asset"
  }],

  status: {
    type: String,
    enum: ["pending", "running", "completed", "failed", "cancelled"],
    default: "pending"
  },

  startedAt: Date,

  completedAt: Date

}, { timestamps: true });

module.exports = mongoose.model("Scan", ScanSchema);