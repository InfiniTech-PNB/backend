/**
 * @file assetDiscovery.js
 * @description Routes for discovering network assets (subdomains, IPs, services) for a monitored domain.
 * Interacts with the Python discovery service.
 */

const express = require("express");
const router = express.Router();
const axios = require("axios");
const authMiddleware = require("../middlewares/authMiddleware");

const Domain = require("../models/Domain");
const Asset = require("../models/Asset");
const Service = require("../models/Service");

// Apply authentication to all discovery routes
router.use(authMiddleware);

/**
 * @route POST /api/asset-discovery/:id/discover
 * @description Triggers the network discovery process for a specific domain.
 * @param {string} id - The MongoDB ID of the Domain to scan.
 * @returns {Object} 200 - Success message and the list of discovered assets.
 * @returns {Error} 404 - Domain not found.
 * @returns {Error} 500 - Python service failure or database error.
 */
router.post("/:id/discover", async (req, res) => {
  try {
    const domain = await Domain.findById(req.params.id);

    if (!domain) {
      return res.status(404).json({ message: "Domain not found" });
    }

    const domainName = domain.domainName;

    // Call Python discovery service (FastAPI)
    const result = await axios.post(
      "http://localhost:8000/discover",
      { domain: domainName },
      { headers: { "Content-Type": "application/json" } }
    );

    if (result.status !== 200) {
      throw new Error("Asset discovery service failed");
    }

    const data = result.data;

    // Map and insert assets one by one to get their IDs for services
    const assets = [];
    for (const assetData of data.assets) {
      // Create or update asset (Upsert: Update if exists, Insert if not)
      const asset = await Asset.findOneAndUpdate(
        { domainId: domain._id, host: assetData.host, ip: assetData.ip },
        {
          domainId: domain._id,
          host: assetData.host,
          ip: assetData.ip,
          assetType: assetData.asset_type || "UNKNOWN"
        },
        { upsert: true, new: true }
      );

      assets.push(asset);

      // Map and insert services (ports) for this specific asset
      if (assetData.services && assetData.services.length > 0) {
        const servicesToInsert = assetData.services.map(svc => ({
          assetId: asset._id,
          port: svc.port,
          protocolName: svc.protocol_name
        }));

        // Clear old services for this asset before re-inserting to avoid duplicates
        await Service.deleteMany({ assetId: asset._id });
        await Service.insertMany(servicesToInsert);
      }
    }

    res.json({
      message: "Assets discovered successfully",
      total: assets.length,
      assets: assets
    });

  } catch (error) {
    console.error("Asset discovery error:", error);
    res.status(500).json({ message: error.message });
  }
});

/**
 * @route GET /api/asset-discovery/:id/assets
 * @description Retrieves all discovered assets and their associated services for a domain.
 * @param {string} id - The MongoDB ID of the Domain.
 * @returns {Object} 200 - List of assets with nested services.
 * @returns {Error} 404 - Domain not found.
 */
router.get("/:id/assets", async (req, res) => {
  try {
    const domain = await Domain.findById(req.params.id);

    if (!domain) {
      return res.status(404).json({ message: "Domain not found" });
    }

    // Join Asset and Service collections
    const assets = await Asset.aggregate([
      { $match: { domainId: domain._id } },
      {
        $lookup: {
          from: "services",
          localField: "_id",
          foreignField: "assetId",
          as: "services"
        }
      },
      { $sort: { host: 1 } }
    ]);

    res.json({
      total: assets.length,
      assets
    });

  } catch (error) {
    console.error("Error fetching assets:", error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;