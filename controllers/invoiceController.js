const invoiceModel = require("../models/invoiceModel");

function invoiceApiNotImplemented(req, res) {
  return res.status(501).json({
    success: false,
    message: "Invoice API is not implemented yet.",
  });
}

async function getInvoices(req, res) {
  try {
    const createdBy =
      req.user.role === "Super Admin" ? undefined : req.user.user_id;
    const invoices = await invoiceModel.getAllInvoices(createdBy);

    return res.status(200).json({
      success: true,
      count: invoices.length,
      invoices,
    });
  } catch (error) {
    console.error("Get invoices error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve invoices.",
    });
  }
}

async function getInvoice(req, res) {
  const invoiceId = Number(req.params.id);
  if (!Number.isInteger(invoiceId) || invoiceId <= 0) {
    return res.status(400).json({
      success: false,
      message: "Invalid invoice ID.",
    });
  }

  try {
    const createdBy =
      req.user.role === "Super Admin" ? undefined : req.user.user_id;
    const invoice = await invoiceModel.getInvoiceById(invoiceId, createdBy);

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
    console.error("Get invoice error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve invoice.",
    });
  }
}

module.exports = {
  getInvoices,
  getInvoice,
  addInvoice: invoiceApiNotImplemented,
  editInvoice: invoiceApiNotImplemented,
  removeInvoice: invoiceApiNotImplemented,
};