
const express = require("express");

const {
  getOverview,
  getFinancialOverviewController,
  getInvoiceStatus,
} = require("../controllers/superAdminDashboardController");

const authMiddleware = require("../middleware/authMiddleware");
const superAdminMiddleware = require("../middleware/superAdminMiddleware");

const router = express.Router();

// Dashboard summary
router.get(
  "/overview",
  authMiddleware,
  superAdminMiddleware,
  getOverview
);

// Financial overview
router.get(
  "/financial-overview",
  authMiddleware,
  superAdminMiddleware,
  getFinancialOverviewController
);

// Invoice status overview
router.get(
  "/invoice-status",
  authMiddleware,
  superAdminMiddleware,
  getInvoiceStatus
);

module.exports = router;
