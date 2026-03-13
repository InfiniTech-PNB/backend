/**
 * @typedef {Object} Asset
 * @property {ObjectId} domainId - Reference to the parent Domain.
 * @property {string} host - The hostname or subdomain (e.g., api.example.com).
 * @property {string} ip - Resolved IP address of the host.
 * @property {string} assetType - Classification of the asset (WEB, API, VPN, etc.).
 */

const mongoose = require("mongoose");

const AssetSchema = new mongoose.Schema({
  domainId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Domain",
    required: true
  },

  host: {
    type: String,
    required: true
  },

  ip: {
    type: String,
    required: true
  },

  assetType: {
    type: String,
    enum: [
      "API", "VPN", "MAIL", "DOCUMENTATION", "MONITORING",
      "CI_CD", "AUTH", "ADMIN", "CDN", "DATABASE",
      "STORAGE", "INFRASTRUCTURE", "NETWORK", "DEVELOPMENT",
      "ECOMMERCE", "WEB", "UNKNOWN"
    ],
    default: "UNKNOWN"
  }
});

module.exports = mongoose.model("Asset", AssetSchema);