/**
 * @file assetDiscovery.js
 * @description These routes help find what assets (like subdomains, IP addresses, and open ports) 
 * belong to a domain. It talks to our discovery service to map out your network footprint.
 */

const express = require("express");
const router = express.Router();
const axios = require("axios");
const authMiddleware = require("../middlewares/authMiddleware");

const Domain = require("../models/Domain");
const Asset = require("../models/Asset");
const Service = require("../models/Service");
const { toCamel, toSnake } = require("../utils/caseConverter");

router.use(authMiddleware);

/**
 * @route POST /api/asset-discovery/:id/discover
 * @description Starts looking for subdomains and open ports for a specific domain.
 * It will find everything that's public-facing and save it to our database.
 * 
 * ---
 * INPUT EXAMPLE:
 * Path Param: id = "64f1a2b3c4d5e6f7a8b9c0d1" (The unique ID of the domain you added)
 * 
 * ---
 * OUTPUT EXAMPLE:
 * {
 *   "message": "Assets discovered successfully",
 *   "total": 2,
 *   "assets": [
 *     {
 *       "_id": "67c6...",
 *       "host": "api.example.com",
 *       "ip": "93.184.216.34",
 *       "assetType": "API"
 *     },
 *     {
 *       "_id": "67c7...",
 *       "host": "www.example.com",
 *       "ip": "93.184.216.35",
 *       "assetType": "WEB"
 *     }
 *   ]
 * }
 */
router.post("/:id/discover", async (req, res) => {
  try {
    const domain = await Domain.findById(req.params.id);

    if (!domain) {
      return res.status(404).json({ message: "We couldn't find that domain in our records." });
    }

    const domainName = domain.domainName;

    // We ask the discovery service (running locally) to do the heavy lifting
    const result = await axios.post(
      "http://localhost:8000/discover",
      { domain: domainName },
      { headers: { "Content-Type": "application/json" } }
    );

    if (result.status !== 200) {
      throw new Error("The background discovery service encountered an error.");
    }

    const data = toCamel(result.data);

    // We save each discovered asset and its open services (ports)
    const assets = [];
    for (const assetData of data.assets) {
      const asset = await Asset.findOneAndUpdate(
        { domainId: domain._id, host: assetData.host, ip: assetData.ip },
        {
          domainId: domain._id,
          host: assetData.host,
          ip: assetData.ip,
          assetType: assetData.assetType || "UNKNOWN"
        },
        { upsert: true, returnDocument: "after" }
      );

      assets.push(asset);

      if (assetData.services && assetData.services.length > 0) {
        const servicesToInsert = assetData.services.map(svc => ({
          assetId: asset._id,
          port: svc.port,
          protocolName: svc.protocolName
        }));

        // We clear out old port info for this asset to keep things fresh
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
    console.error("Discovery error:", error);
    res.status(500).json({ message: error.message });
  }
});

/**
 * @route GET /api/asset-discovery/:id/assets
 * @description Shows you all the assets we found for a domain, along with their open ports.
 * 
 * ---
 * INPUT EXAMPLE:
 * Path Param: id = "64f1a2b3c4d5e6f7a8b9c0d1"
 * 
 * ---
 * OUTPUT EXAMPLE:
 * {
 *   "total": 1,
 *   "assets": [
 *     {
 *       "_id": "67c6...",
 *       "host": "api.example.com",
 *       "ip": "93.184.216.34",
 *       "assetType": "API",
 *       "services": [
 *         {
 *           "port": 443,
 *           "protocolName": "HTTPS"
 *         }
 *       ]
 *     }
 *   ]
 * }
 */
router.get("/:id/assets", async (req, res) => {
  try {
    const domain = await Domain.findById(req.params.id);

    if (!domain) {
      return res.status(404).json({ message: "We couldn't find that domain." });
    }

    // Combine assets and their ports into a single list
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