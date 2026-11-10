const AdminDashboardModel = require('../models/adminDashboardModel');
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

function getDashboardOwnerId(req) {
  return req.user?.role === "Super Admin" ? undefined : req.user?.user_id;
}

// @desc    Get Admin Dashboard Overview Stats
// @route   GET /api/admin/dashboard/overview
// @access  Private (Admin & Super Admin)
exports.getOverview = async (req, res) => {
  const period = getDashboardPeriod(req, res);
  if (!period) return;

  try {
    const stats = await AdminDashboardModel.getOverviewStats(
      getDashboardOwnerId(req),
      period
    );
    res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error fetching admin dashboard overview:', error);
    res.status(500).json({ success: false, message: 'Server error fetching overview stats' });
  }
};

// @desc    Get Admin Financial Overview (Income vs Expenses)
// @route   GET /api/admin/dashboard/financial-overview
// @access  Private (Admin & Super Admin)
exports.getFinancialOverview = async (req, res) => {
  const period = getDashboardPeriod(req, res);
  if (!period) return;

  try {
    const financialData = await AdminDashboardModel.getFinancialOverview(
      getDashboardOwnerId(req),
      period
    );
    res.status(200).json({
      success: true,
      data: financialData
    });
  } catch (error) {
    console.error('Error fetching financial overview:', error);
    res.status(500).json({ success: false, message: 'Server error fetching financial stats' });
  }
};

// @desc    Get Admin Invoice Status Summary
// @route   GET /api/admin/dashboard/invoice-status
// @access  Private (Admin & Super Admin)
exports.getInvoiceStatus = async (req, res) => {
  const period = getDashboardPeriod(req, res);
  if (!period) return;

  try {
    const statusSummary = await AdminDashboardModel.getInvoiceStatusSummary(
      getDashboardOwnerId(req),
      period
    );
    res.status(200).json({
      success: true,
      data: statusSummary
    });
  } catch (error) {
    console.error('Error fetching invoice status summary:', error);
    res.status(500).json({ success: false, message: 'Server error fetching invoice status' });
  }
};