const express = require("express");

const {
  getQuotationItemOptions,
  getQuotations,
  getQuotation,
  addQuotation,
  updateQuotation,
  deleteQuotation,
} = require("../controllers/quotationController");

const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

// Test quotation route
router.get("/test", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Quotation route test works successfully!",
  });
});

// Get active service/item options
router.get("/item-options", authMiddleware, getQuotationItemOptions);

// View all quotations
router.get("/", authMiddleware, getQuotations);

// Create a quotation
router.post("/", authMiddleware, addQuotation);

// Update a quotation by ID
router.put("/:id", authMiddleware, updateQuotation);

// Delete a quotation by ID
router.delete("/:id", authMiddleware, deleteQuotation);

// View one quotation by ID
router.get("/:id", authMiddleware, getQuotation);

module.exports = router;