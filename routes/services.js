/**
 * @file services.js
 * @description Routes for managing and retrieving network services associated with assets.
 */

const express = require("express");
const router = express.Router();
const authMiddleware = require("../middlewares/authMiddleware");

const Service = require("../models/Service");
const Asset = require("../models/Asset");

// Apply authentication to all service routes
router.use(authMiddleware);

/**
 * @route GET /api/services/:id/services
 * @description Fetches all network services (HTTPS, SMTP, etc.) detected on a specific asset.
 * @param {string} id - The MongoDB ID of the Asset.
 * @returns {Array<Object>} 200 - List of Service documents.
 * @returns {Error} 404 - Asset not found.
 */
router.get("/:id/services", async (req, res) => {
    try {
        const asset = await Asset.findById(req.params.id);
        if (!asset) {
            return res.status(404).json({ message: "Asset not found" });
        }
        const services = await Service.find({ assetId: asset._id });
        res.json(services);
    } catch (error) {
        console.error("Error fetching services:", error);
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;