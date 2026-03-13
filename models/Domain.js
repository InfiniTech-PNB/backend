/**
 * @typedef {Object} Domain
 * @property {string} domainName - The root domain name being monitored (e.g., ibm.com).
 * @property {Date} createdAt - Timestamp when the domain was added.
 */

const mongoose = require("mongoose");

const DomainSchema = new mongoose.Schema({
  domainName: {
    type: String,
    required: true,
    unique: true,
  },

  createdAt: {
    type: Date,
    default: Date.now,
  }
});

module.exports = mongoose.model("Domain", DomainSchema);