const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const { superAdminMiddleware } = require("../middleware/authMiddleware");
const uploadPaymentSlip = require("../middleware/uploadPaymentSlip");
const {
  getPayments,
  addPayment,
  verifyPayment,
  rejectPayment,
} = require("../controllers/paymentController");

const router = express.Router();

router.get("/", authMiddleware, getPayments);
router.post("/", authMiddleware, uploadPaymentSlip, addPayment);
router.patch(
  "/:id/verify",
  authMiddleware,
  superAdminMiddleware,
  verifyPayment
);
router.patch(
  "/:id/reject",
  authMiddleware,
  superAdminMiddleware,
  rejectPayment
);

module.exports = router;
