
const {
  getDashboardOverview,
  getFinancialOverview,
  getInvoiceStatusOverview,
} = require("../models/superAdminDashboardModel");
const { normalizePeriod } = require("../utils/periodFilter");

function getDashboardPeriod(req, res) {
  const period = normalizePeriod(req.query.period);
  if (!period) {
    res.status(400).json({
      success: false,
      message: "Invalid period. Allowed: 1w, 1m, 3m, 1y, 2y.",
    });
    return null;
  }
  return period;
}

// GET /api/super-admin/dashboard/overview
async function getOverview(req, res) {
  const period = getDashboardPeriod(req, res);
  if (!period) return;

  try {
    const data = await getDashboardOverview(period);

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Dashboard overview error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load dashboard overview.",
    });
  }
}

// GET /api/super-admin/dashboard/financial-overview
async function getFinancialOverviewController(req, res) {
  const period = getDashboardPeriod(req, res);
  if (!period) return;

  try {
    const data = await getFinancialOverview(period);

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Financial overview error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load financial overview.",
    });
  }
}

// GET /api/super-admin/dashboard/invoice-status
async function getInvoiceStatus(req, res) {
  const period = getDashboardPeriod(req, res);
  if (!period) return;

  try {
    const data = await getInvoiceStatusOverview(period);

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Invoice status overview error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load invoice status overview.",
    });
  }
}

module.exports = {
  getOverview,
  getFinancialOverviewController,
  getInvoiceStatus,
};
