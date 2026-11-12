
const {
  getAllCustomers,
  searchCustomers,
  getCustomerOverview,
  createCustomer,
  getMostQuotedCustomers,
} = require("../models/customerModel");
const { createAuditLog } = require("../models/auditLogModel");
const { normalizePeriod } = require("../utils/periodFilter");

// --------------------------------------------------
// Get all customers
// --------------------------------------------------

async function getCustomers(req, res) {
  try {
    const search = String(req.query.search || "").trim();
    const period = normalizePeriod(req.query.period);
    if (!period) {
      return res.status(400).json({
        success: false,
        message: "Invalid period. Allowed: 1w, 1m, 3m, 1y, 2y.",
      });
    }

    const [customers, summary] = await Promise.all([
      getAllCustomers({ search, period }),
      getCustomerOverview(period),
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

async function getCustomerSuggestions(req, res) {
  const search = String(req.query.search || "").trim();

  if (search.length > 100) {
    return res.status(400).json({
      success: false,
      message: "Search must be 100 characters or fewer.",
    });
  }

  if (!search) {
    return res.status(200).json({
      success: true,
      count: 0,
      customers: [],
    });
  }

  try {
    const customers = await searchCustomers(search);
    return res.status(200).json({
      success: true,
      count: customers.length,
      customers,
    });
  } catch (error) {
    console.error("Get customer suggestions error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve customer suggestions.",
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

    const customerId = await createCustomer(
      {
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
      },
      undefined,
      { rejectExisting: true }
    );

    await createAuditLog({
      userId: req.user?.user_id,
      userRole: req.user?.role,
      action: "Customer Created",
      recordId: customerId,
      details: `Created customer ${customer_name.trim()}.`,
    });

    return res.status(201).json({
      success: true,
      message: "Customer created or existing customer reused successfully.",
      customer_id: customerId,
    });
  } catch (error) {
    console.error("Add customer error:", error);

    if (error.code === "CUSTOMER_ALREADY_EXISTS") {
      return res.status(409).json({
        success: false,
        message:
          error.createdByRole === "Super Admin"
            ? "This customer has already been added by Super Admin."
            : "This customer already exists.",
      });
    }

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
    const period = normalizePeriod(req.query.period);
    if (!period) {
      return res.status(400).json({
        success: false,
        message: "Invalid period. Allowed: 1w, 1m, 3m, 1y, 2y.",
      });
    }

    const customers = await getMostQuotedCustomers(period);

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
  getCustomerSuggestions,
  addCustomer,
  getMostQuotedCustomersController,
};
