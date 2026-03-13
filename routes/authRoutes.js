/**
 * @file authRoutes.js
 * @description Routes for user authentication and session management.
 */

const express = require("express");
const router = express.Router();
const { login, verifyOtp } = require("../controllers/authController");

/**
 * @route POST /api/auth/login
 * @description Initiates login. Validates credentials and sends an OTP to the user's email.
 * @body {string} email - User's email address.
 * @body {string} password - User's password.
 * @returns {Object} 200 - Success message indicating OTP was sent.
 */
router.post("/login", login);

/**
 * @route POST /api/auth/verify-otp
 * @description Verifies the OTP and returns a JWT session token.
 * @body {string} email - User's email address.
 * @body {string} otp - The 6-digit OTP received via email.
 * @returns {Object} 200 - JWT token and user details (name, email, role).
 */
router.post("/verify-otp", verifyOtp);

module.exports = router;