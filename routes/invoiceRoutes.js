
const express = require("express");

const {
  getInvoices,
  getInvoice,
  addInvoice,
  editInvoice,
  removeInvoice,
  getInvoicePdf,
  sendInvoiceEmail,
  recordPayment,
} = require("../controllers/invoiceController");

const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

// List invoices available to the authenticated user.
router.get("/", authMiddleware, getInvoices);

// Get one invoice and its details.
router.get("/:id", authMiddleware, getInvoice);

// Create a manual invoice or one based on a quotation.
router.post("/", authMiddleware, addInvoice);

// Download the invoice PDF.
router.get("/:id/pdf", authMiddleware, getInvoicePdf);

// Email the invoice PDF to the customer.
router.post("/:id/send-email", authMiddleware, sendInvoiceEmail);

// Record a payment against the invoice.
router.post("/:id/payments", authMiddleware, recordPayment);

// Update an existing invoice.
router.put("/:id", authMiddleware, editInvoice);

// Delete a Draft invoice.
router.delete("/:id", authMiddleware, removeInvoice);

module.exports = router;
