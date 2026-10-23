const express = require("express");

const {
  getQuotations,
  addQuotation,
} = require("../controllers/quotationController");

const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

// Get all quotations
router.get("/", authMiddleware, getQuotations);

// Create a new quotation
router.post("/", authMiddleware, addQuotation);

module.exports = router;