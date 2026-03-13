/**
 * @module otpService
 * @description Manages One-Time Password (OTP) lifecycle using Redis for volatile storage.
 * Handles generation, delivery (via email), and secure verification.
 */

const { createClient } = require("redis");
const { sendEmailOtp } = require("./emailService");
const ExpressError = require("../utils/ExpressError");
require("dotenv").config();

// Initialize Redis Client for temporary OTP storage
const client = createClient({
    username: process.env.REDIS_USERNAME,
    password: process.env.REDIS_PASSWORD,
    socket: {
        host: process.env.REDIS_END_POINT,
        port: process.env.REDIS_PORT,
        tls:true
    }
});

client.on('error', err => console.log('Redis Client Error', err));
client.connect().then(()=>console.log("Redis Connected"));

/**
 * Generates a 6-digit OTP, stores it in Redis with 5-min TTL, and sends it via email.
 * @async
 * @param {string} email - Recipient email.
 * @returns {Promise<void>}
 */
async function sendOtp(email) {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await client.set(`otp:${email}`, otp, { EX: 300 }); // 300 seconds = 5 minutes
    await sendEmailOtp(email, otp);
}

/**
 * Verifies a provided OTP against the one stored in Redis.
 * @async
 * @param {string} email - User email (used as key).
 * @param {string} otp - User-provided OTP.
 * @throws {ExpressError} - If OTP is expired (410) or invalid (401).
 * @returns {Promise<void>}
 */
async function verifyOtp(email, otp) {
    const storedOtp = await client.get(`otp:${email}`);
    if (!storedOtp) {
        throw new ExpressError("OTP expired", 410);
    }

    if (storedOtp !== otp) {
        throw new ExpressError("Invalid OTP", 401);
    }
    // Delete OTP after successful verification to prevent reuse
    await client.del(`otp:${email}`);
}

module.exports = {
    sendOtp,
    verifyOtp
};