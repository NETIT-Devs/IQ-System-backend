
const invoiceModel = require("../models/invoiceModel");

// Validate invoice data
function validateInvoice(data, items) {
  const requiredFields = [
    "invoice_number",
    "customer_id",
    "invoice_date",
    "subtotal",
    "discount_amount",
    "tax_amount",
    "total_amount",
    "amount_paid",
    "balance_due",
  ];

  for (const field of requiredFields) {
    if (data[field] === undefined || data[field] === null || data[field] === "") {
      return `${field} is required.`;
    }
  }

  if (
    !Number.isInteger(Number(data.customer_id)) ||
    Number(data.customer_id) <= 0
  ) {
    return "Invalid customer_id.";
  }

  const numberFields = [
    "subtotal",
    "discount_amount",
    "tax_amount",
    "total_amount",
    "amount_paid",
    "balance_due",
  ];

  for (const field of numberFields) {
    if (!Number.isFinite(Number(data[field])) || Number(data[field]) < 0) {
      return `Invalid ${field}.`;
    }
  }

  if (!Array.isArray(items) || items.length === 0) {
    return "At least one invoice item is required.";
  }

  for (const item of items) {
    if (
      typeof item.item_name !== "string" ||
      !item.item_name.trim()
    ) {
      return "Each item must have an item_name.";
    }

    if (
      !Number.isFinite(Number(item.unit_price)) ||
      Number(item.unit_price) < 0 ||
      !Number.isFinite(Number(item.tax_rate)) ||
      Number(item.tax_rate) < 0 ||
      Number(item.tax_rate) > 100 ||
      !Number.isFinite(Number(item.line_total)) ||
      Number(item.line_total) < 0
    ) {
      return "Invalid invoice item amount or tax rate.";
    }
  }

  return null;
}

// GET all invoices
async function getInvoices(req, res) {
  try {
    const invoices = await invoiceModel.getAllInvoices();

    return res.status(200).json({
      success: true,
      count: invoices.length,
      invoices,
    });
  } catch (error) {
    console.error("Get invoices error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve invoices.",
    });
  }
}

// GET invoice by ID
async function getInvoice(req, res) {
  try {
    const invoiceId = Number(req.params.id);

    if (!Number.isInteger(invoiceId) || invoiceId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid invoice ID.",
      });
    }

    const invoice = await invoiceModel.getInvoiceById(invoiceId);

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found.",
      });
    }

    return res.status(200).json({
      success: true,
      invoice,
    });
  } catch (error) {
    console.error("Get invoice error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve invoice.",
    });
  }
}

// POST create invoice
async function addInvoice(req, res) {
  try {
    const items = req.body.items;

    const validationError = validateInvoice(req.body, items);

    if (validationError) {
      return res.status(400).json({
        success: false,
        message: validationError,
      });
    }

    const invoiceId = await invoiceModel.createInvoice(
      {
        ...req.body,
        created_by: req.user.user_id,
      },
      items
    );

    return res.status(201).json({
      success: true,
      message: "Invoice created successfully.",
      invoice_id: invoiceId,
    });
  } catch (error) {
    console.error("Create invoice error:", error.message);

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "Invoice number already exists.",
      });
    }

    if (error.code === "ER_NO_REFERENCED_ROW_2") {
      return res.status(400).json({
        success: false,
        message: "Invalid customer or quotation reference.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to create invoice.",
    });
  }
}

// PUT update invoice
async function editInvoice(req, res) {
  try {
    const invoiceId = Number(req.params.id);

    if (!Number.isInteger(invoiceId) || invoiceId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid invoice ID.",
      });
    }

    const validationError = validateInvoice(req.body, req.body.items);

    if (validationError) {
      return res.status(400).json({
        success: false,
        message: validationError,
      });
    }

    const updated = await invoiceModel.updateInvoice(
      invoiceId,
      req.body,
      req.body.items
    );

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Invoice updated successfully.",
    });
  } catch (error) {
    console.error("Update invoice error:", error.message);

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "Invoice number already exists.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to update invoice.",
    });
  }
}

// DELETE invoice
async function removeInvoice(req, res) {
  try {
    const invoiceId = Number(req.params.id);

    if (!Number.isInteger(invoiceId) || invoiceId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid invoice ID.",
      });
    }

    const deleted = await invoiceModel.deleteInvoice(invoiceId);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Invoice deleted successfully.",
    });
  } catch (error) {
    console.error("Delete invoice error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to delete invoice.",
    });
  }
}

module.exports = {
  getInvoices,
  getInvoice,
  addInvoice,
  editInvoice,
  removeInvoice,
};
