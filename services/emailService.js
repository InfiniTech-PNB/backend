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

/**
 * Sends automated audit reports with PDF attachments.
 * @async
 * @param {string} email - Recipient
 * @param {string} scheduleName - Name of the schedule
 * @param {Array} attachments - Array of {filename, content} objects (PDF Buffers)
 */
async function sendReportEmail(email, scheduleName, attachments) {
    await transporter.sendMail({
        from: `"PNB PQC Audit Bot" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: `📊 AUDIT PACKAGE: ${scheduleName}`,
        html: `
            <div style="font-family: sans-serif; padding: 20px; color: #0f172a;">
                <h2 style="color: #f97316;">Strategic Audit Delivery</h2>
                <p>Hello,</p>
                <p>The <b>${scheduleName}</b> has been processed. Please find the requested data modules attached as separate PDF documents.</p>
                <hr style="border: 1px solid #f1f5f9; margin: 20px 0;" />
                <p style="font-size: 10px; color: #94a3b8; text-transform: uppercase;">
                    PNB Hackathon 2026 • Automated Post-Quantum Cryptography Audit
                </p>
            </div>
        `,
        attachments: attachments
    });
}

module.exports = { sendEmailOtp, sendReportEmail };