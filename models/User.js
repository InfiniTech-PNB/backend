/**
 * @typedef {Object} User
 * @property {string} name - Full name of the user.
 * @property {string} email - Unique email address (used for login).
 * @property {string} password - Hashed password.
 * @property {boolean} isVerified - Whether the user has verified their email via OTP.
 * @property {string} role - Access level (user/admin).
 */

const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    email: {
        type: String,
        unique: true,
        required: true
    },
    password: {
        type: String,
        required: true
    },
    isVerified: {
        type: Boolean,
        default: false
    },
    role: {
        type: String,
        enum: ["user", "admin"],
        default: "user"
    }
}, { timestamps: true })

module.exports = mongoose.model("User", userSchema);