
const {
  getDashboardOverview,
  getFinancialOverview,
  getInvoiceStatusOverview,
} = require("../models/superAdminDashboardModel");

// GET /api/super-admin/dashboard/overview
async function getOverview(req, res) {
  try {
    const data = await getDashboardOverview();

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
  try {
    const data = await getFinancialOverview();

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
  try {
    const data = await getInvoiceStatusOverview();

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
