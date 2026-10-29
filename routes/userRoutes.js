
const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const superAdminMiddleware = authMiddleware.superAdminMiddleware;

const {
  listUsers,
  createAdmin,
  updateAdminAccount,
  toggleAdminAccountStatus,
  removeAdmin,
} = require("../controllers/userController");

const router = express.Router();

// User Management — Super Admin only
router.get("/", authMiddleware, superAdminMiddleware, listUsers);
router.post("/", authMiddleware, superAdminMiddleware, createAdmin);
router.put("/:id", authMiddleware, superAdminMiddleware, updateAdminAccount);
router.patch(
  "/:id/status",
  authMiddleware,
  superAdminMiddleware,
  toggleAdminAccountStatus
);
router.delete("/:id", authMiddleware, superAdminMiddleware, removeAdmin);

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
