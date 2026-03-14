const mongoose = require("mongoose");

const ChatSchema = new mongoose.Schema({

  scanId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Scan",
    required: true
  },

  question: {
    type: String,
    required: true
  },

  answer: {
    type: String,
    required: true
  },

  askedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },

  createdAt: {
    type: Date,
    default: Date.now
  }

});

module.exports = mongoose.model("Chat", ChatSchema);
