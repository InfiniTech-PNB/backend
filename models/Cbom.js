const mongoose = require("mongoose");

const CbomSchema = new mongoose.Schema({

  scanId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Scan",
    required: true
  },

  // 🔥 NEW → mode support
  mode: {
    type: String,
    enum: ["aggregate", "per_asset"],
    required: true
  },

  // 🔥 NEW → asset list (for aggregate)
  assets: [String],

  // =========================
  // ALGORITHMS
  // =========================
  algorithms: [
    {
      asset: String,
      name: String,
      assetType: String,
      primitive: String,
      mode: String,
      classicalSecurityLevel: String,
      oid: String
    }
  ],

  // =========================
  // KEYS
  // =========================
  keys: [
    {
      asset: String,
      name: String,
      assetType: String,
      id: String,
      state: String,
      size: Number,
      creationDate: String,
      activationDate: String
    }
  ],

  // =========================
  // PROTOCOLS
  // =========================
  protocols: [
    {
      asset: String,
      name: String,
      version: String, // 🔥 FIX (not array)
      cipherSuites: [String],
      alpn: String, // 🔥 NEW
      oid: String
    }
  ],

  // =========================
  // CERTIFICATES (MAJOR UPDATE)
  // =========================
  certificates: [
    {
      // 🔥 IMPORTANT → link to asset
      asset: String,

      // -------------------------
      // LEAF CERTIFICATE
      // -------------------------
      leafCertificate: {
        subjectName: String,
        issuerName: String,

        validityPeriod: {
          notBefore: String,
          notAfter: String
        },

        signatureAlgorithmReference: String,
        subjectPublicKeyReference: String,

        certificateFormat: String,

        certificateExtension: mongoose.Schema.Types.Mixed,

        fingerprintSha256: String,

        // 🔥 NEW → history
        certificateHistory: [
          {
            issuer: String,
            notBefore: String,
            notAfter: String
          }
        ]
      },

      // -------------------------
      // CERTIFICATE CHAIN
      // -------------------------
      certificateChain: [
        {
          subject: String,
          issuer: String,
          fingerprintSha256: String,
          isChainCertificate: Boolean
        }
      ]
    }
  ],

  // =========================
  // FAILED ASSETS
  // =========================
  failedAssets: [
    {
      host: String,
      reason: String
    }
  ],

  generatedAt: {
    type: Date,
    default: Date.now
  }

}, { timestamps: true });

module.exports = mongoose.model("Cbom", CbomSchema);