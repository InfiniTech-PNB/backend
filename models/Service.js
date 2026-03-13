/**
 * @typedef {Object} Service
 * @property {ObjectId} assetId - Reference to the parent Asset.
 * @property {number} port - Network port number.
 * @property {string} protocolName - Name of the protocol (e.g., HTTPS, SSH).
 */

const mongoose = require("mongoose");

const ServiceSchema = new mongoose.Schema({
  assetId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Asset",
    required: true
  },

  port: {
    type: Number,
    required: true
  },

  protocolName: {
    type: String,
    required: true
  }
});

module.exports = mongoose.model("Service", ServiceSchema);