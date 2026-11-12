
const express = require("express");

const {
  getCustomers,
  getCustomerSuggestions,
  addCustomer,
  getMostQuotedCustomersController,
} = require("../controllers/customerController");

const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

// Test route
router.get("/test", (req, res) => {
  res.json({
    success: true,
    message: "Customer route test works successfully!",
  });
});

// Most quoted customers - keep this before "/:id" if such a route exists.
router.get(
  "/most-quoted",
  authMiddleware,
  getMostQuotedCustomersController
);

// Search customers for invoice and quotation selectors.
router.get("/suggestions", authMiddleware, getCustomerSuggestions);

// Get all customers
router.get("/", authMiddleware, getCustomers);

// Add customer manually
router.post("/", authMiddleware, addCustomer);

module.exports = router;
