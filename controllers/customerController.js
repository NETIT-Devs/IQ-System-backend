
const {
  getAllCustomers,
  createCustomer,
  getMostQuotedCustomers,
} = require("../models/customerModel");

// --------------------------------------------------
// Get all customers
// --------------------------------------------------

async function getCustomers(req, res) {
  try {
    const customers = await getAllCustomers();

    return res.status(200).json({
      success: true,
      count: customers.length,
      customers,
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
