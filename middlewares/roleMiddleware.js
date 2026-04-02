/**
 * @function authorizeRoles
 * @description Middleware factory to restrict access based on user roles (RBAC).
 * Must be used AFTER authMiddleware.
 * @param {...string} roles - List of allowed roles (e.g., 'admin', 'user').
 * @returns {Function} - Express middleware function.
 */

const ExpressError = require("../utils/expressError");

const authorizeRoles = (...roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return next(
                new ExpressError("Access denied", 403)
            );
        }
        next();
    };
};

module.exports = authorizeRoles;