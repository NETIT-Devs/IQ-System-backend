
const express = require("express");
const { login, changePassword } = require("../controllers/authController");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/login", login);

// Change password - authenticated users only
router.post("/change-password", authMiddleware, changePassword);

module.exports = router;
