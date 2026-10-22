
const {
  getAllCustomers,
  createCustomer,
} = require("../models/customerModel");

async function getCustomers(req, res) {
  try {
    const customers = await getAllCustomers();

    return res.status(200).json({
      success: true,
      customers,
    });
  } catch (error) {
    console.error("Get customers error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve customers.",
    });
  }
}

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
    } = req.body;

    if (
      typeof customer_name !== "string" ||
      !customer_name.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "Customer name is required.",
      });
    }

    const userId = req.user?.user_id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    const customerId = await createCustomer({
      customer_name: customer_name.trim(),
      company_name,
      email,
      phone,
      address,
      city,
      country,
      tax_number,
      notes,
      created_by: userId,
    });

    return res.status(201).json({
      success: true,
      message: "Customer created successfully.",
      customer_id: customerId,
    });
  } catch (error) {
    console.error("Create customer error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to create customer.",
    });
  }
}

module.exports = {
  getCustomers,
  addCustomer,
};
