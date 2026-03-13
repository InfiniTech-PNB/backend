/**
 * @typedef {Object} ScanResult
 * @description Detailed cryptographic configuration for a specific service on an asset.
 * @property {ObjectId} scanId - Reference to the Scan job.
 * @property {ObjectId} assetId - Reference to the parent Asset.
 * @property {number} port - Port number (e.g., 443).
 * @property {string} protocol - Protocol name (e.g., HTTPS).
 * @property {string} tlsVersion - Active TLS version.
 * @property {string} cipher - Active cipher suite.
 * @property {string} keyExchange - Classical key exchange algorithm.
 * @property {string} signatureAlgorithm - Classical signature algorithm.
 * @property {Array<string>} supportedTlsVersions - All TLS versions supported by the server.
 * @property {Array<string>} cipherSuites - All cipher suites supported.
 * @property {Array<string>} weakCiphers - Detected weak or deprecated ciphers.
 * @property {number} keySize - Bit size of the public key.
 * @property {string} issuer - Certificate issuer.
 * @property {string} expires - Certificate expiration date.
 * @property {boolean} pfsSupported - Whether Perfect Forward Secrecy is enabled.
 * @property {Array<string>} vulnerabilities - CVEs or security flakes detected.
 * @property {boolean} selfSigned - Whether the certificate is self-signed.
 * @property {string} pqcKeyExchange - Post-Quantum Key Exchange algorithm (if any).
 * @property {string} pqcSignature - Post-Quantum Signature algorithm (if any).
 * @property {boolean} hybridPqc - Whether hybrid PQC is active.
 * @property {number} pqcReadyScore - Calculated PQC readiness (0-1).
 */

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

  port: Number,
  protocol: String,

  tlsVersion: String,
  cipher: String,
  keyExchange: String,
  signatureAlgorithm: String,

  supportedTlsVersions: [String],
  cipherSuites: [String],
  weakCiphers: [String],

  keySize: Number,
  issuer: String,
  expires: String,

  pfsSupported: Boolean,
  vulnerabilities: [String],

  selfSigned: Boolean,

  pqcKeyExchange: String,
  pqcSignature: String,
  hybridPqc: Boolean,

  pqcReadyScore: Number
});

module.exports = mongoose.model("ScanResult", ScanResultSchema);