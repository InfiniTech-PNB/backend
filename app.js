/**
 * @file app.js
 * @description Main entry point for the PNB Backend Service.
 * This file initializes the Express application, connects to MongoDB,
 * sets up middleware (CORS, JSON parsing), and registers all API routes.
 */

require("dotenv").config();
const express = require("express");
const app = express();
const cors = require("cors");

// Import Route Handlers
const authRoutes = require("./routes/authRoutes");
const assetDiscoveryRoutes = require("./routes/assetDiscovery");
const cbomRoutes = require("./routes/cbom");
const dashboardRoutes = require("./routes/dashboard");
const domainRoutes = require("./routes/domainRoutes");
const scanRoutes = require("./routes/scan");
const serviceRoutes = require("./routes/services");
const chatBotRoutes = require("./routes/chatBot");
const reportRoutes = require("./routes/reportRoutes");

// Database Configuration
const { connectDB } = require("./config/connectDB");
connectDB();

/**
 * Global Middleware Setup
 */
app.use(express.json()); // Parses incoming requests with JSON payloads
app.use(express.urlencoded({ extended: true })); // Parses urlencoded bodies

// CORS Configuration: Allows communication from Frontend (5173) and Python services (8000)
app.use(cors({
    origin: ["http://localhost:5173", "http://localhost:8000","http://localhost:9000"],
    credentials: true
}));
require('./services/reportWorker');

/**
 * Health Check Endpoint
 * @route GET /
 * @returns {string} Welcome message
 */
app.get("/", (req, res) => {
    res.send("Welcome to pnb");
})

/**
 * API Routes Registration
 * Each module handles specific cryptographic or administrative functionalities.
 */

// Auth: Login, OTP Verification, and User Management
app.use("/api/auth", authRoutes);

// Asset Discovery: Network scanning to find hosts, IPs, and open services for a domain
app.use("/api/asset-discovery", assetDiscoveryRoutes);

// CBOM: Cryptographic Bill of Materials generation and export
app.use("/api/cbom", cbomRoutes);

// Dashboard: High-level statistics and risk summaries
app.use("/api/dashboard", dashboardRoutes);

// Domains: CRUD and detailed summaries for monitored domains
app.use("/api/domains", domainRoutes);

// Scan: Deep and Soft cryptographic vulnerability scanning
app.use("/api/scan", scanRoutes);

// Services: Details about specific network services (HTTPS, SMTP, etc.) for discovered assets
app.use("/api/services", serviceRoutes);

// Chatbot: Ask questions about scan results
app.use("/api/chatbot", chatBotRoutes);

app.use("/api/reports", reportRoutes);

/**
 * Global Error Handling Middleware
 * Catches all errors and returns a standardized JSON response.
 */
app.use((err, req, res, next) => {
    const { statusCode = 500, message = "Something went wrong" } = err;
    res.status(statusCode).json({
        success: false,
        message
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});