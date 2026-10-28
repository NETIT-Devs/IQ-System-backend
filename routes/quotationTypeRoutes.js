
const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");

const {
  listTypes,
  addType,
  editType,
  removeType,
} = require("../controllers/quotationTypeController");

const router = express.Router();
const superAdminMiddleware = authMiddleware.superAdminMiddleware;

// Admin and Super Admin: view types
router.get("/", authMiddleware, listTypes);

// Super Admin only: add type
router.post(
  "/",
  authMiddleware,
  superAdminMiddleware,
  addType
);

// Super Admin only: edit type
router.put(
  "/:id",
  authMiddleware,
  superAdminMiddleware,
  editType
);

// Super Admin only: delete type
router.delete(
  "/:id",
  authMiddleware,
  superAdminMiddleware,
  removeType
);

module.exports = router;
