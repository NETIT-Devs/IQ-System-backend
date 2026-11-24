
const jwt = require("jsonwebtoken");
const db = require("../config/db");

// Verify JWT and authenticate Admin / Super Admin users
async function authMiddleware(req, res, next) {
  let decoded;

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

    decoded = jwt.verify(token, process.env.JWT_SECRET);

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

  try {
    const [rows] = await db.execute(
      `SELECT user_id, role, is_active
       FROM users
       WHERE user_id = ?
       LIMIT 1`,
      [decoded.user_id]
    );
    const user = rows[0];

    if (!user || Number(user.is_active) !== 1) {
      return res.status(401).json({
        success: false,
        message: "User account is inactive or no longer exists.",
      });
    }

    if (!["Admin", "Super Admin"].includes(user.role)) {
      return res.status(403).json({
        success: false,
        message: "Access denied.",
      });
    }

    req.user = {
      user_id: user.user_id,
      role: user.role,
    };

    return next();
  } catch (error) {
    console.error("Authentication user lookup error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to verify the user account.",
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
