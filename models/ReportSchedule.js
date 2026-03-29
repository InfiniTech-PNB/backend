// models/ReportSchedule.js
const mongoose = require("mongoose");

const ReportScheduleSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    scheduleName: { type: String, required: true },
    reportType: { type: String, default: "Project Audit Summary" },
    frequency: { type: String },
    targetDomainId: { type: mongoose.Schema.Types.ObjectId, ref: "Domain", required: true }, // 'all' removed
    // 🔥 NEW: Store specific assets for this schedule
    selectedAssets: [{
        assetId: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset' },
        businessContext: { type: Object }
    }],
    includeSections: {
        assets: { type: Boolean, default: true },
        cboms: { type: Boolean, default: true },
        scanResults: { type: Boolean, default: true }
    },
    time: { type: String },
    email: { type: String },
    isEnabled: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model("ReportSchedule", ReportScheduleSchema);