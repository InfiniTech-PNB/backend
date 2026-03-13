/**
 * @typedef {Object} Cbom
 * @description Cryptographic Bill of Materials (CBOM).
 * Stores a comprehensive inventory of all cryptographic assets detected during a scan.
 * @property {ObjectId} scanId - Reference to the Scan that generated this CBOM.
 * @property {Array<Object>} algorithms - List of detected cryptographic algorithms.
 * @property {Array<Object>} keys - List of detected cryptographic keys.
 * @property {Array<Object>} protocols - List of detected protocols (TLS version, etc.).
 * @property {Array<Object>} certificates - List of detected X.509 certificates.
 */

const mongoose = require("mongoose");

const CbomSchema = new mongoose.Schema({
  scanId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Scan",
    required: true
  },

  algorithms: [
    {
      name: String,
      asset_type: String,
      primitive: String,
      mode: String,
      classical_security_level: String,
      oid: String
    }
  ],

  keys: [
    {
      name: String,
      asset_type: String,
      id: String,
      state: String,
      size: Number,
      creation_date: String,
      activation_date: String
    }
  ],

  protocols: [
    {
      name: String,
      version: [String],
      cipher_suites: [String],
      oid: String
    }
  ],

  certificates: [
    {
      name: String,
      subject_name: String,
      issuer_name: String,
      validity_period: String,
      signature_algorithm_reference: String,
      subject_public_key_reference: Number,
      certificate_format: String,
      certificate_extension: String
    }
  ],

  generatedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("Cbom", CbomSchema);