
const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const superAdminMiddleware = authMiddleware.superAdminMiddleware;

const {
  createAdmin,
  removeAdmin,
} = require("../controllers/userController");

const router = express.Router();

// Create Admin — Super Admin only
router.post(
  "/admins",
  authMiddleware,
  superAdminMiddleware,
  createAdmin
);

// Delete Admin — Super Admin only
router.delete(
  "/admins/:id",
  authMiddleware,
  superAdminMiddleware,
  removeAdmin
);

module.exports = router;
