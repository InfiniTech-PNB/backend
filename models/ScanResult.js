const mongoose = require("mongoose");

const ScanResultSchema = new mongoose.Schema({

  scanId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Scan",
    required: true
  },

  assetId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Asset",
    required: true
  },

  host: String,
  ip: String,
  port: Number,
  protocol: String,
  status: String,
  failureReason: String,
  // =========================
  // NEGOTIATED (same as output)
  // =========================
  negotiated: {
    tlsVersion: String,
    cipher: String,
    keyExchange: String,

    serverTempKey: String,
    serverTempKeySize: Number,

    alpn: String,

    sessionReused: Boolean,

    ocsp: {
      supported: Boolean,
      stapled: Boolean
    }
  },

  // =========================
  // SUPPORTED
  // =========================
  supported: {
    tlsVersions: [String],
    cipherSuites: [String]
  },

  // =========================
  // PQC (IMPORTANT)
  // =========================
  pqc: {
    negotiated: [String],   // actual PQC algos used
    supported: [String],    // PQC algos supported

    classification: mongoose.Schema.Types.Mixed,
    confidence: String
  },

  // =========================
  // CERTIFICATE
  // =========================
  certificate: {

    subject: String,
    issuer: String,

    san: [String],
    sanCount: Number,

    notBefore: String,
    expires: String,

    signatureAlgorithm: String,
    rawSignatureAlgorithm: String,

    fingerprintSha256: String,

    publicKey: {
      type: {
        type: String,
        default: null
      },
      size: {
        type: Number,
        default: null
      }
    },

    selfSigned: Boolean,

    extensions: {
      keyUsage: [String],
      extendedKeyUsage: [String],
      basicConstraints: mongoose.Schema.Types.Mixed
    },

    certificateHistory: [
      {
        issuer: String,
        notBefore: String,
        notAfter: String
      }
    ],

    certificateChain: [
      {
        subject: String,
        issuer: String,
        fingerprintSha256: String
      }
    ]
  },

  // =========================
  // SECURITY FLAGS
  // =========================
  weakCiphers: [String],
  pfsSupported: Boolean,
  vulnerabilities: [String],

  // =========================
  // SCORING
  // =========================
  pqcReadyScore: {
    type: Number,
    default: 0
  },

  mlScore: {
    type: Number,
    default: 0
  },

  envScore: {
    type: Number,
    default: 0
  },

  // =========================
  // BUSINESS CONTEXT
  // =========================
  businessContext: {

    assetCriticality: { type: Number, min: 0, max: 10 },
    confidentialityWeight: { type: Number, min: 0, max: 10 },
    integrityWeight: { type: Number, min: 0, max: 10 },
    availabilityWeight: { type: Number, min: 0, max: 10 },
    slaRequirement: { type: Number, min: 0, max: 10 },
    remediationDifficulty: { type: Number, min: 0, max: 10 },
    dependentServices: { type: Number, min: 0, max: 10 }

  }

}, { timestamps: true });

module.exports = mongoose.model("ScanResult", ScanResultSchema);