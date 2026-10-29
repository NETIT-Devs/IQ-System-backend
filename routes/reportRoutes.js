const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const {
  getSummary,
  getInvoices,
  getQuotations,
  getIncome,
} = require("../controllers/reportController");

const router = express.Router();

router.use(authMiddleware);
router.get("/summary", getSummary);
router.get("/invoices", getInvoices);
router.get("/quotations", getQuotations);
router.get("/monthly-income", getIncome);

module.exports = router;
