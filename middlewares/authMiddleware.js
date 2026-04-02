/**
 * @function authMiddleware
 * @description Standardized JWT authentication middleware.
 * Verifies the "Authorization: Bearer <token>" header and attaches the decoded user to req.user.
 */

const jwt = require("jsonwebtoken");
const ExpressError = require("../utils/expressError");

module.exports = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return next(new ExpressError("Unauthorized", 401));
    }

    // Header Format: "Bearer <token>"
    const token = authHeader.split(" ")[1];
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; // Contains id, email, and role
        next();
    } catch (err) {
        next(new ExpressError("Invalid token", 401));
    }
};