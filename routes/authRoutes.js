
const express = require("express");

const {
  login,
  changePassword,
  forgotPassword,
  resetPassword,
} = require("../controllers/authController");

const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

// Login
router.post("/login", login);

// Forgot password - request password reset email
router.post("/forgot-password", forgotPassword);

// Reset password - use reset token
router.post("/reset-password", resetPassword);

// Change password - logged-in users only
router.post("/change-password", authMiddleware, changePassword);

module.exports = router;
