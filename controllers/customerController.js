
const {
  getAllCustomers,
  getCustomerOverview,
  createCustomer,
  getMostQuotedCustomers,
} = require("../models/customerModel");
const { createAuditLog } = require("../models/auditLogModel");

// --------------------------------------------------
// Get all customers
// --------------------------------------------------

async function getCustomers(req, res) {
  try {
    const search = String(req.query.search || "").trim();
    const period = String(req.query.period || "").trim();
    const allowedPeriods = ["", "today", "last7days", "thismonth"];

    if (!allowedPeriods.includes(period)) {
      return res.status(400).json({
        success: false,
        message: "Invalid period. Allowed: today, last7days, thismonth.",
      });
    }

    const [customers, summary] = await Promise.all([
      getAllCustomers({ search, period }),
      getCustomerOverview(),
    ]);

    return res.status(200).json({
      success: true,
      count: customers.length,
      customers,
      summary,
    });
  } catch (error) {
    console.error("Get customers error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve customers.",
    });
  }
}

// --------------------------------------------------
// Add customer manually
// --------------------------------------------------

async function addCustomer(req, res) {
  try {
    const {
      customer_name,
      company_name,
      email,
      phone,
      address,
      city,
      country,
      tax_number,
      notes,
    } = req.body || {};

    if (
      typeof customer_name !== "string" ||
      !customer_name.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "Customer name is required.",
      });
    }

    const customerId = await createCustomer({
      customer_name,
      company_name,
      email,
      phone,
      address,
      city,
      country,
      tax_number,
      notes,
      created_by: req.user?.user_id || null,
    });

    await createAuditLog({
      userId: req.user?.user_id,
      userRole: req.user?.role,
      action: "Customer Created or Reused",
      recordId: customerId,
      details: `Created or reused customer ${customer_name.trim()}.`,
    });

    return res.status(201).json({
      success: true,
      message: "Customer created or existing customer reused successfully.",
      customer_id: customerId,
    });
  } catch (error) {
    console.error("Add customer error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create customer.",
    });
  }
}

// --------------------------------------------------
// Most quoted customers
// --------------------------------------------------

async function getMostQuotedCustomersController(req, res) {
  try {
    const customers = await getMostQuotedCustomers();

    return res.status(200).json({
      success: true,
      count: customers.length,
      customers,
    });
  } catch (error) {
    console.error("Get most quoted customers error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve most quoted customers.",
    });
  }
}

module.exports = {
  getCustomers,
  addCustomer,
  getMostQuotedCustomersController,
};
