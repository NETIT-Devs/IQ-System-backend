
const jwt = require("jsonwebtoken");

// Verify JWT and authenticate Admin / Super Admin users
function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Authentication token is required.",
      });
    }

    const token = authHeader.slice(7).trim();

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Authentication token is required.",
      });
    }

    if (!process.env.JWT_SECRET) {
      console.error("JWT_SECRET is missing from environment configuration.");

      return res.status(500).json({
        success: false,
        message: "Server configuration error.",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (
      !decoded ||
      !decoded.user_id ||
      !["Admin", "Super Admin"].includes(decoded.role)
    ) {
      return res.status(403).json({
        success: false,
        message: "Access denied.",
      });
    }

    req.user = {
      user_id: decoded.user_id,
      role: decoded.role,
    };

    return next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Authentication token has expired. Please log in again.",
      });
    }

    return res.status(401).json({
      success: false,
      message: "Invalid authentication token.",
    });
  }
}

// Allow only Super Admin users for protected actions
function superAdminMiddleware(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Authentication is required.",
    });
  }

  if (req.user.role !== "Super Admin") {
    return res.status(403).json({
      success: false,
      message: "Only Super Admin can perform this action.",
    });
  }

  return next();
}

module.exports = authMiddleware;
module.exports.superAdminMiddleware = superAdminMiddleware;
