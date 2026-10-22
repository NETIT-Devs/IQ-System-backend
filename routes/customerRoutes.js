const express = require("express");
const {
  getCustomers,
  addCustomer,
} = require("../controllers/customerController");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

// ==========================================
// Test Route (Public - No Auth Required)
// Endpoint: GET /api/customers/test
// ==========================================
router.get("/test", (req, res) => {
  res.json({
    success: true,
    message: "Customer route test works successfully!",
  });
});

// ==========================================
// Protected Routes (Authentication Required)
// ==========================================

// Get all customers
// Endpoint: GET /api/customers/
router.get("/", authMiddleware, getCustomers);

// Add a new customer
// Endpoint: POST /api/customers/
router.post("/", authMiddleware, addCustomer);

module.exports = router;