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

// All payment routes require authentication; review actions are Super Admin-only.
router.get("/", authMiddleware, getPayments);
router.post("/", authMiddleware, uploadPaymentSlip, addPayment);
router.patch(
  "/:id/verify",
  authMiddleware,
  superAdminMiddleware,
  verifyPayment
);
router.post(
  "/:id/approve",
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
router.post(
  "/:id/reject",
  authMiddleware,
  superAdminMiddleware,
  rejectPayment
);

module.exports = router;
