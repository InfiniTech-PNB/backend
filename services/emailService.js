/**
 * @module emailService
 * @description Handles outgoing email communications, primarily OTP delivery for authentication.
 */

const nodemailer = require("nodemailer");
require("dotenv").config();

// Configures the SMTP transporter using Gmail (requires App Password in production)
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

/**
 * Sends an OTP code to a user's email address.
 * @async
 * @param {string} email - Destination email address.
 * @param {string} otp - The 6-digit one-time password.
 * @returns {Promise<void>}
 */
async function sendEmailOtp(email, otp) {
    await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: email,
        subject: "Your OTP Code",
        text: `Your OTP is ${otp}. It will expire in 5 minutes.`
    });
}

module.exports = { sendEmailOtp };