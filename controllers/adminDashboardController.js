const AdminDashboardModel = require('../models/adminDashboardModel');

// @desc    Get Admin Dashboard Overview Stats
// @route   GET /api/admin/dashboard/overview
// @access  Private (Admin & Super Admin)
exports.getOverview = async (req, res) => {
  try {
    const stats = await AdminDashboardModel.getOverviewStats();
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
  try {
    const financialData = await AdminDashboardModel.getFinancialOverview();
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
  try {
    const statusSummary = await AdminDashboardModel.getInvoiceStatusSummary();
    res.status(200).json({
      success: true,
      data: statusSummary
    });
  } catch (error) {
    console.error('Error fetching invoice status summary:', error);
    res.status(500).json({ success: false, message: 'Server error fetching invoice status' });
  }
};