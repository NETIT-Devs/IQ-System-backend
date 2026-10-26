
const express = require("express");
const router = express.Router();

const adminController = require("../controllers/adminDashboardController");
const authMiddleware = require("../middleware/authMiddleware");

// GET /api/admin/dashboard/overview
router.get(
  "/overview",
  authMiddleware,
  adminController.getOverview
);

// GET /api/admin/dashboard/financial-overview
router.get(
  "/financial-overview",
  authMiddleware,
  adminController.getFinancialOverview
);

// GET /api/admin/dashboard/invoice-status
router.get(
  "/invoice-status",
  authMiddleware,
  adminController.getInvoiceStatus
);

module.exports = router;
