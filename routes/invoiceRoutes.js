
const express = require("express");

const {
  getInvoices,
  getInvoice,
  addInvoice,
  editInvoice,
  removeInvoice,
} = require("../controllers/invoiceController");

const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

// Get all invoices
router.get("/", authMiddleware, getInvoices);

// Get invoice by ID
router.get("/:id", authMiddleware, getInvoice);

// Create invoice
router.post("/", authMiddleware, addInvoice);

// Update invoice
router.put("/:id", authMiddleware, editInvoice);

// Delete invoice
router.delete("/:id", authMiddleware, removeInvoice);

module.exports = router;
