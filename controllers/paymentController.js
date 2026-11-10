const fs = require("fs/promises");
const paymentModel = require("../models/paymentModel");
const { getCompanySettings } = require("../models/companySettingsModel");
const { normalizePeriod } = require("../utils/periodFilter");

const paymentMethods = new Set([
  "Bank Transfer",
  "Cash",
  "Card",
  "Online",
  "Other",
]);
const paymentTypes = new Set(["Advance", "Partial", "Full Payment"]);

function isPositiveInteger(value) {
  return Number.isInteger(Number(value)) && Number(value) > 0;
}

function isValidDate(value) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
  );
}

function getPaymentAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount) &&
    amount > 0 &&
    Math.abs(amount * 100 - Math.round(amount * 100)) < 0.000001
    ? amount
    : null;
}

async function removeSlip(filePath) {
  if (!filePath) {
    return;
  }

  try {
    await fs.unlink(filePath);
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error("Could not remove unused payment slip:", error.message);
    }
  }
}

async function hasValidFileSignature(file) {
  let contents;
  try {
    contents = await fs.readFile(file.path);
  } catch (error) {
    console.error("Could not read uploaded payment slip:", error.message);
    return false;
  }

  const extension = file.originalname.split(".").pop().toLowerCase();
  if (extension === "pdf") {
    return contents.subarray(0, 5).toString() === "%PDF-";
  }
  if (extension === "png") {
    return contents
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
  if (extension === "jpg" || extension === "jpeg") {
    return (
      contents.length >= 3 &&
      contents[0] === 0xff &&
      contents[1] === 0xd8 &&
      contents[2] === 0xff
    );
  }
  return false;
}

function getErrorResponse(error) {
  if (error.code === "QUOTATION_NOT_FOUND") {
    return { status: 404, message: error.message };
  }
  if (
    error.code === "QUOTATION_CUSTOMER_MISMATCH" ||
    error.code === "PAYMENT_EXCEEDS_QUOTATION_TOTAL" ||
    error.code === "PAYMENT_EXCEEDS_INVOICE_BALANCE"
  ) {
    return { status: 400, message: error.message };
  }
  if (
    error.code === "PAYMENT_NOT_PENDING" ||
    error.code === "INVOICE_CANCELLED"
  ) {
    return { status: 409, message: error.message };
  }
  if (error.code === "INVOICE_NOT_FOUND") {
    return { status: 409, message: error.message };
  }
  return null;
}

async function getPayments(req, res) {
  const period = normalizePeriod(req.query.period);
  if (!period) {
    return res.status(400).json({
      success: false,
      message: "Invalid period. Allowed: 1w, 1m, 3m, 1y, 2y.",
    });
  }

  try {
    const [payments, summary, companySettings] = await Promise.all([
      paymentModel.getPayments(req.user.user_id, req.user.role, period),
      paymentModel.getPaymentSummary(req.user.user_id, req.user.role, period),
      getCompanySettings(),
    ]);
    return res.status(200).json({
      success: true,
      count: payments.length,
      payments,
      summary,
      companySettings,
      period,
    });
  } catch (error) {
    console.error("Get payments error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve payments.",
    });
  }
}

async function addPayment(req, res) {
  const file = req.file;
  const payment = req.body || {};
  const customerId = Number(payment.customer_id);
  const quotationId = Number(payment.quotation_id);
  const amount = getPaymentAmount(payment.amount);

  let validationMessage = null;
  if (!file) {
    validationMessage = "Payment slip is required.";
  } else if (
    !isPositiveInteger(payment.customer_id) ||
    !isPositiveInteger(payment.quotation_id)
  ) {
    validationMessage = "A valid customer_id and quotation_id are required.";
  } else if (!isValidDate(payment.payment_date)) {
    validationMessage = "Invalid payment_date. Use YYYY-MM-DD format.";
  } else if (!paymentMethods.has(payment.payment_method)) {
    validationMessage = "Invalid payment_method.";
  } else if (!paymentTypes.has(payment.payment_type)) {
    validationMessage = "Invalid payment_type.";
  } else if (!amount) {
    validationMessage = "Payment amount must be a positive amount with up to two decimals.";
  } else if (
    (payment.reference_number !== undefined &&
      typeof payment.reference_number !== "string") ||
    (payment.notes !== undefined && typeof payment.notes !== "string")
  ) {
    validationMessage = "reference_number and notes must be text.";
  } else if (
    (payment.reference_number || "").length > 255 ||
    (payment.notes || "").length > 2000
  ) {
    validationMessage = "reference_number or notes exceeds the allowed length.";
  }

  if (validationMessage) {
    await removeSlip(file?.path);
    return res.status(400).json({
      success: false,
      message: validationMessage,
    });
  }

  if (!(await hasValidFileSignature(file))) {
    await removeSlip(file.path);
    return res.status(400).json({
      success: false,
      message: "Uploaded payment slip file is invalid.",
    });
  }

  try {
    const paymentId = await paymentModel.createPendingPayment({
      userId: req.user.user_id,
      role: req.user.role,
      customerId,
      quotationId,
      paymentDate: payment.payment_date,
      amount,
      paymentMethod: payment.payment_method,
      paymentType: payment.payment_type,
      referenceNumber: payment.reference_number?.trim(),
      notes: payment.notes?.trim(),
      paymentSlip: `/uploads/payment-slips/${file.filename}`,
    });

    return res.status(201).json({
      success: true,
      message: "Payment submitted for verification.",
      payment_id: paymentId,
      payment_status: "Pending",
    });
  } catch (error) {
    await removeSlip(file.path);
    console.error("Create payment error:", error);

    const response = getErrorResponse(error);
    if (response) {
      return res.status(response.status).json({
        success: false,
        message: response.message,
      });
    }

    if (error.code === "ER_NO_REFERENCED_ROW_2") {
      return res.status(400).json({
        success: false,
        message: "Invalid customer, quotation, or user reference.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to save payment.",
    });
  }
}

async function verifyPayment(req, res) {
  const paymentId = Number(req.params.id);
  if (!isPositiveInteger(paymentId)) {
    return res.status(400).json({
      success: false,
      message: "Invalid payment ID.",
    });
  }

  try {
    const payment = await paymentModel.verifyPayment(
      paymentId,
      req.user.user_id
    );
    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Payment verified successfully.",
      payment,
    });
  } catch (error) {
    console.error("Verify payment error:", error);
    const response = getErrorResponse(error);
    if (response) {
      return res.status(response.status).json({
        success: false,
        message: response.message,
      });
    }
    return res.status(500).json({
      success: false,
      message: "Failed to verify payment.",
    });
  }
}

async function rejectPayment(req, res) {
  const paymentId = Number(req.params.id);
  const rejectionReason =
    typeof req.body?.rejection_reason === "string"
      ? req.body.rejection_reason.trim()
      : "";

  if (!isPositiveInteger(paymentId)) {
    return res.status(400).json({
      success: false,
      message: "Invalid payment ID.",
    });
  }
  if (!rejectionReason || rejectionReason.length > 1000) {
    return res.status(400).json({
      success: false,
      message: "A rejection_reason of 1 to 1000 characters is required.",
    });
  }

  try {
    const rejected = await paymentModel.rejectPayment(
      paymentId,
      req.user.user_id,
      rejectionReason
    );
    if (!rejected) {
      return res.status(404).json({
        success: false,
        message: "Payment not found.",
      });
    }
    return res.status(200).json({
      success: true,
      message: "Payment rejected.",
      payment_id: paymentId,
      payment_status: "Rejected",
    });
  } catch (error) {
    console.error("Reject payment error:", error);
    const response = getErrorResponse(error);
    if (response) {
      return res.status(response.status).json({
        success: false,
        message: response.message,
      });
    }
    return res.status(500).json({
      success: false,
      message: "Failed to reject payment.",
    });
  }
}

module.exports = {
  getPayments,
  addPayment,
  verifyPayment,
  rejectPayment,
};
