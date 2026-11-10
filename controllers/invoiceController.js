const invoiceModel = require("../models/invoiceModel");
const { getCompanySettings } = require("../models/companySettingsModel");
const { createEmailTransporter } = require("../config/email");
const { createInvoicePdf } = require("../utils/invoicePdf");
const { createAuditLog } = require("../models/auditLogModel");
const {
  createNotification,
  createNotificationsForRole,
} = require("../models/notificationModel");
const { normalizePeriod } = require("../utils/periodFilter");

async function notifySuperAdmins(notification) {
  try {
    await createNotificationsForRole("Super Admin", notification);
  } catch (error) {
    console.error("Create invoice notification error:", error);
  }
}

async function notifyInvoiceCreator(invoice, notification) {
  if (!invoice?.created_by) return;

  try {
    await createNotification({
      ...notification,
      userId: invoice.created_by,
      referenceType: "invoice",
      referenceId: invoice.invoice_id,
    });
  } catch (error) {
    console.error("Create invoice decision notification error:", error);
  }
}

// Super Admins can access all records; Admins are limited to their own.
function getOwnerId(req) {
  return req.user?.role === "Super Admin" ? undefined : req.user?.user_id;
}

// Validate the invoice ID and load an invoice accessible to the current user.
async function findInvoice(req, res) {
  const invoiceId = Number(req.params.id);
  if (!Number.isInteger(invoiceId) || invoiceId <= 0) {
    res.status(400).json({
      success: false,
      message: "Invalid invoice ID.",
    });
    return null;
  }

  const invoice = await invoiceModel.getInvoiceById(
    invoiceId,
    getOwnerId(req)
  );
  if (!invoice) {
    res.status(404).json({
      success: false,
      message: "Invoice not found.",
    });
    return null;
  }

  return invoice;
}

// Generate and return a downloadable invoice PDF.
async function getInvoicePdf(req, res) {
  try {
    const invoice = await findInvoice(req, res);
    if (!invoice) return;

    const company = await getCompanySettings();
    const pdf = await createInvoicePdf(invoice, company || {});
    const filename = `${String(invoice.invoice_number || "invoice").replace(
      /[^A-Za-z0-9._-]/g,
      "_"
    )}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`
    );
    return res.status(200).send(pdf);
  } catch (error) {
    console.error("Generate invoice PDF error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to generate invoice PDF.",
    });
  }
}

// Email the generated invoice PDF to the customer's saved email address.
async function sendInvoiceEmail(req, res) {
  try {
    const invoice = await findInvoice(req, res);
    if (!invoice) return;

    if (!invoice.customer_email) {
      return res.status(400).json({
        success: false,
        message: "The customer does not have an email address.",
      });
    }

    const company = await getCompanySettings();
    const pdf = await createInvoicePdf(invoice, company || {});
    const transporter = createEmailTransporter();
    const invoiceNumber =
      invoice.invoice_number || `Invoice ${invoice.invoice_id}`;

    const result = await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: invoice.customer_email,
      subject: `Invoice ${invoiceNumber}`,
      text: `Dear ${invoice.customer_name || "Customer"},\n\nPlease find invoice ${invoiceNumber} attached.\n\n${company?.company_name || ""}`,
      attachments: [
        {
          filename: `${String(invoiceNumber).replace(
            /[^A-Za-z0-9._-]/g,
            "_"
          )}.pdf`,
          content: pdf,
          contentType: "application/pdf",
        },
      ],
    });

    await createAuditLog({
      userId: req.user.user_id,
      userRole: req.user.role,
      action: "Invoice Emailed",
      recordId: invoice.invoice_id,
      details: `Emailed invoice ${invoiceNumber} to ${invoice.customer_email}.`,
    });

    return res.status(200).json({
      success: true,
      message: "Invoice emailed successfully.",
      recipient: invoice.customer_email,
      message_id: result.messageId,
    });
  } catch (error) {
    console.error("Send invoice email error:", error);

    if (error.message === "Email service is not configured.") {
      return res.status(503).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(502).json({
      success: false,
      message: "Failed to send invoice email.",
    });
  }
}

// Read customer details from the supported request payload formats.
function getCustomerData(invoice) {
  if (invoice.customer && typeof invoice.customer === "object") {
    return invoice.customer;
  }
  if (
    invoice.customer_details &&
    typeof invoice.customer_details === "object"
  ) {
    return invoice.customer_details;
  }
  return {
    customer_name: invoice.customer_name,
    company_name: invoice.company_name,
    email: invoice.email,
    phone: invoice.phone,
    address: invoice.address,
    city: invoice.city,
    country: invoice.country,
    tax_number: invoice.tax_number,
    notes: invoice.customer_notes,
  };
}

// Validate invoice fields, customer selection, dates, discounts, and line items.
function validateInvoice(invoice, items) {
  const quotationId = Number(invoice.quotation_id);
  const canUseQuotationItems =
    invoice.quotation_id !== undefined &&
    invoice.quotation_id !== null &&
    invoice.quotation_id !== "" &&
    Number.isInteger(quotationId) &&
    quotationId > 0;
  const requiredFields = ["invoice_date"];

  for (const field of requiredFields) {
    if (
      invoice[field] === undefined ||
      invoice[field] === null ||
      invoice[field] === ""
    ) {
      return `${field} is required.`;
    }
  }

  if (
    !canUseQuotationItems &&
    invoice.invoice_number !== undefined &&
    invoice.invoice_number !== null &&
    invoice.invoice_number !== "" &&
    (typeof invoice.invoice_number !== "string" ||
      !invoice.invoice_number.trim())
  ) {
    return "Invalid invoice_number.";
  }

  if (canUseQuotationItems) {
    if (
      invoice.customer_id !== undefined &&
      invoice.customer_id !== null &&
      invoice.customer_id !== "" &&
      (!Number.isInteger(Number(invoice.customer_id)) ||
        Number(invoice.customer_id) <= 0)
    ) {
      return "Invalid customer_id.";
    }
  } else if (invoice.customer_id !== undefined && invoice.customer_id !== null && invoice.customer_id !== "") {
    if (
      !Number.isInteger(Number(invoice.customer_id)) ||
      Number(invoice.customer_id) <= 0
    ) {
      return "Invalid customer_id.";
    }
  } else {
    const customer = getCustomerData(invoice);
    if (
      typeof customer.customer_name !== "string" ||
      !customer.customer_name.trim()
    ) {
      return "Select an existing customer or provide a customer name.";
    }
  }

  if (
    typeof invoice.invoice_date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(invoice.invoice_date) ||
    Number.isNaN(Date.parse(`${invoice.invoice_date}T00:00:00Z`)) ||
    new Date(`${invoice.invoice_date}T00:00:00Z`)
      .toISOString()
      .slice(0, 10) !== invoice.invoice_date
  ) {
    return "Invalid invoice_date. Use YYYY-MM-DD format.";
  }

  if (
    invoice.due_date !== undefined &&
    invoice.due_date !== null &&
    invoice.due_date !== "" &&
    (typeof invoice.due_date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(invoice.due_date) ||
      Number.isNaN(Date.parse(`${invoice.due_date}T00:00:00Z`)) ||
      new Date(`${invoice.due_date}T00:00:00Z`)
        .toISOString()
        .slice(0, 10) !== invoice.due_date)
  ) {
    return "Invalid due_date. Use YYYY-MM-DD format.";
  }

  if (
    invoice.quotation_id !== undefined &&
    invoice.quotation_id !== null &&
    invoice.quotation_id !== "" &&
    (!Number.isInteger(Number(invoice.quotation_id)) ||
      Number(invoice.quotation_id) <= 0)
  ) {
    return "Invalid quotation_id.";
  }

  if (
    !canUseQuotationItems &&
    invoice.discount_type !== undefined &&
    !["fixed", "percentage"].includes(invoice.discount_type)
  ) {
    return "discount_type must be fixed or percentage.";
  }

  if (
    !canUseQuotationItems &&
    ((invoice.discount_value !== undefined &&
      (!Number.isFinite(Number(invoice.discount_value)) ||
        Number(invoice.discount_value) < 0)) ||
      (invoice.discount_amount !== undefined &&
        (!Number.isFinite(Number(invoice.discount_amount)) ||
          Number(invoice.discount_amount) < 0)))
  ) {
    return "Discount must be a non-negative number.";
  }

  if (
    !canUseQuotationItems &&
    invoice.discount_type === "percentage" &&
    Number(invoice.discount_value ?? invoice.discount_amount ?? 0) > 100
  ) {
    return "Percentage discount cannot exceed 100.";
  }

  if (
    !canUseQuotationItems &&
    invoice.amount_paid !== undefined &&
    (!Number.isFinite(Number(invoice.amount_paid)) ||
      Number(invoice.amount_paid) < 0)
  ) {
    return "Invalid amount_paid.";
  }

  if (
    !canUseQuotationItems &&
    invoice.currency !== undefined &&
    (typeof invoice.currency !== "string" ||
      !/^[A-Za-z]{3}$/.test(invoice.currency))
  ) {
    return "currency must be a three-letter currency code.";
  }

  if (
    invoice.status !== undefined &&
    !["Draft", "Issued", "Overdue", "Cancelled"].includes(invoice.status)
  ) {
    return "Invalid invoice status.";
  }

  if (canUseQuotationItems) {
    return null;
  }

  if (!Array.isArray(items) || items.length === 0) {
    return "At least one invoice item is required.";
  }

  for (const item of items) {
    if (!item || typeof item.item_name !== "string" || !item.item_name.trim()) {
      return "Each item must have an item_name.";
    }

    if (
      !Number.isFinite(Number(item.unit_price ?? item.price)) ||
      Number(item.unit_price ?? item.price) < 0 ||
      !Number.isFinite(Number(item.tax_rate)) ||
      Number(item.tax_rate) < 0 ||
      Number(item.tax_rate) > 100 ||
      (item.quantity !== undefined &&
        (!Number.isFinite(Number(item.quantity)) ||
          Number(item.quantity) <= 0))
    ) {
      return "Invalid invoice item amount or tax rate.";
    }
  }

  return null;
}

// Return the invoices visible to the authenticated user.
async function getInvoices(req, res) {
  const period = normalizePeriod(req.query.period);
  if (!period) {
    return res.status(400).json({
      success: false,
      message: "Invalid period. Allowed: 1w, 1m, 3m, 1y, 2y.",
    });
  }

  try {
    const invoices = await invoiceModel.getAllInvoices(
      getOwnerId(req),
      period
    );

    return res.status(200).json({
      success: true,
      count: invoices.length,
      invoices,
    });
  } catch (error) {
    console.error("Get invoices error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve invoices.",
    });
  }
}

// List invoices awaiting Super Admin review.
async function getPendingInvoiceApprovals(req, res) {
  const period = normalizePeriod(req.query.period);
  if (!period) {
    return res.status(400).json({
      success: false,
      message: "Invalid period. Allowed: 1w, 1m, 3m, 1y, 2y.",
    });
  }

  try {
    const invoices = await invoiceModel.getPendingInvoiceApprovals(period);
    return res.status(200).json({
      success: true,
      count: invoices.length,
      invoices,
    });
  } catch (error) {
    console.error("Get pending invoice approvals error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve pending invoice approvals.",
    });
  }
}

// Approve an invoice that is waiting for Super Admin review.
async function approveInvoice(req, res) {
  const invoiceId = Number(req.params.id);
  if (!Number.isInteger(invoiceId) || invoiceId <= 0) {
    return res.status(400).json({
      success: false,
      message: "Invalid invoice ID.",
    });
  }

  try {
    const invoice = await invoiceModel.reviewInvoiceApproval(
      invoiceId,
      req.user.user_id,
      "Approved"
    );
    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found.",
      });
    }

    await createAuditLog({
      userId: req.user.user_id,
      userRole: req.user.role,
      action: "Invoice Approved",
      recordId: invoiceId,
      details: `Approved invoice ${invoice.invoice_number}.`,
    });
    await notifyInvoiceCreator(invoice, {
      title: "Invoice Approved",
      message: `Your invoice ${invoice.invoice_number} has been approved.`,
      type: "success",
    });

    return res.status(200).json({
      success: true,
      message: "Invoice approved successfully.",
      invoice_id: invoiceId,
      invoice_number: invoice.invoice_number,
      approval_status: "Approved",
    });
  } catch (error) {
    if (error.code === "INVOICE_NOT_PENDING") {
      return res.status(409).json({
        success: false,
        message: error.message,
      });
    }

    console.error("Approve invoice error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to approve invoice.",
    });
  }
}

// Reject an invoice that is waiting for Super Admin review.
async function rejectInvoice(req, res) {
  const invoiceId = Number(req.params.id);
  const rejectionReason =
    typeof req.body?.rejection_reason === "string"
      ? req.body.rejection_reason.trim()
      : "";

  if (!Number.isInteger(invoiceId) || invoiceId <= 0) {
    return res.status(400).json({
      success: false,
      message: "Invalid invoice ID.",
    });
  }
  if (!rejectionReason || rejectionReason.length > 2000) {
    return res.status(400).json({
      success: false,
      message:
        "A rejection reason is required and must be 2000 characters or fewer.",
    });
  }

  try {
    const invoice = await invoiceModel.reviewInvoiceApproval(
      invoiceId,
      req.user.user_id,
      "Rejected",
      rejectionReason
    );
    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found.",
      });
    }

    await createAuditLog({
      userId: req.user.user_id,
      userRole: req.user.role,
      action: "Invoice Rejected",
      recordId: invoiceId,
      details: `Rejected invoice ${invoice.invoice_number}. Reason: ${rejectionReason}`,
    });
    await notifyInvoiceCreator(invoice, {
      title: "Invoice Rejected",
      message: `Your invoice ${invoice.invoice_number} was rejected. Reason: ${rejectionReason}`,
      type: "error",
    });

    return res.status(200).json({
      success: true,
      message: "Invoice rejected successfully.",
      invoice_id: invoiceId,
      invoice_number: invoice.invoice_number,
      approval_status: "Rejected",
      rejection_reason: rejectionReason,
    });
  } catch (error) {
    if (error.code === "INVOICE_NOT_PENDING") {
      return res.status(409).json({
        success: false,
        message: error.message,
      });
    }

    console.error("Reject invoice error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to reject invoice.",
    });
  }
}

// Return one invoice after applying the current user's ownership scope.
async function getInvoice(req, res) {
  const invoiceId = Number(req.params.id);
  if (!Number.isInteger(invoiceId) || invoiceId <= 0) {
    return res.status(400).json({
      success: false,
      message: "Invalid invoice ID.",
    });
  }

  try {
    const invoice = await invoiceModel.getInvoiceById(
      invoiceId,
      getOwnerId(req)
    );

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found.",
      });
    }

    return res.status(200).json({
      success: true,
      invoice,
    });
  } catch (error) {
    console.error("Get invoice error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve invoice.",
    });
  }
}

// Validate and create a manual or quotation-based invoice.
async function addInvoice(req, res) {
  const invoice = req.body || {};
  const items = invoice.items;
  const validationError = validateInvoice(invoice, items);

  if (validationError) {
    return res.status(400).json({
      success: false,
      message: validationError,
    });
  }

  try {
    const { invoiceId, invoiceNumber } = await invoiceModel.createInvoice(
      {
        ...invoice,
        created_by: req.user.user_id,
      },
      Array.isArray(items) ? items : [],
      getOwnerId(req),
      {
        returnDetails: true,
        approvalStatus: req.user.role === "Admin" ? "Pending" : "Not Required",
      }
    );

    await createAuditLog({
      userId: req.user.user_id,
      userRole: req.user.role,
      action: "Invoice Created",
      recordId: invoiceId,
      details: `Created invoice ${invoiceNumber}.`,
    });

    if (req.user.role === "Admin") {
      await notifySuperAdmins({
        title: "Invoice Pending Approval",
        message: `Invoice ${invoiceNumber} is waiting for your approval.`,
        type: "warning",
        referenceType: "invoice",
        referenceId: invoiceId,
      });
    }

    return res.status(201).json({
      success: true,
      message: "Invoice created successfully.",
      invoice_id: invoiceId,
      invoice_number: invoiceNumber,
      approval_status: req.user.role === "Admin" ? "Pending" : "Not Required",
    });
  } catch (error) {
    console.error("Create invoice error:", error);

    if (error.message === "Customer name is required.") {
      return res.status(400).json({
        success: false,
        message: "Select an existing customer or provide a customer name.",
      });
    }

    if (error.code === "QUOTATION_NOT_FOUND") {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    if (error.code === "INVALID_INVOICE_DISCOUNT") {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    if (error.code === "INVALID_INVOICE_PAYMENT") {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    if (error.code === "INVOICE_NUMBER_LOCK_TIMEOUT") {
      return res.status(503).json({
        success: false,
        message: error.message,
      });
    }

    if (
      error.code === "QUOTATION_HAS_NO_ITEMS" ||
      error.code === "QUOTATION_CUSTOMER_MISMATCH"
    ) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    if (
      error.code === "VERIFIED_PAYMENT_REQUIRED" ||
      error.code === "QUOTATION_PAYMENTS_CHANGED" ||
      error.code === "QUOTATION_ALREADY_INVOICED"
    ) {
      return res.status(409).json({
        success: false,
        message: error.message,
      });
    }

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "Invoice number or quotation has already been used.",
      });
    }

    if (error.code === "ER_NO_REFERENCED_ROW_2") {
      return res.status(400).json({
        success: false,
        message: "Invalid customer or quotation reference.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to create invoice.",
    });
  }
}

// Validate and update an invoice owned by the current user.
async function editInvoice(req, res) {
  const invoiceId = Number(req.params.id);
  if (!Number.isInteger(invoiceId) || invoiceId <= 0) {
    return res.status(400).json({
      success: false,
      message: "Invalid invoice ID.",
    });
  }

  const invoice = req.body || {};
  const validationError = validateInvoice(invoice, invoice.items);
  if (validationError) {
    return res.status(400).json({
      success: false,
      message: validationError,
    });
  }

  try {
    const updatedInvoice = await invoiceModel.updateInvoice(
      invoiceId,
      invoice,
      invoice.items,
      getOwnerId(req)
    );

    if (!updatedInvoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found.",
      });
    }

    await createAuditLog({
      userId: req.user.user_id,
      userRole: req.user.role,
      action: "Invoice Updated",
      recordId: invoiceId,
      details: `Updated invoice ${invoice.invoice_number || invoiceId}.`,
    });

    return res.status(200).json({
      success: true,
      message: "Invoice updated successfully.",
      invoice: updatedInvoice,
    });
  } catch (error) {
    console.error("Update invoice error:", error);

    if (error.message === "Customer name is required.") {
      return res.status(400).json({
        success: false,
        message: "Select an existing customer or provide a customer name.",
      });
    }

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "Invoice number already exists.",
      });
    }

    if (error.code === "ER_NO_REFERENCED_ROW_2") {
      return res.status(400).json({
        success: false,
        message: "Invalid customer or quotation reference.",
      });
    }

    if (
      error.code === "INVALID_INVOICE_DISCOUNT" ||
      error.code === "INVALID_INVOICE_PAYMENT"
    ) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to update invoice.",
    });
  }
}

// Delete a Draft invoice only.
async function removeInvoice(req, res) {
  const invoiceId = Number(req.params.id);
  if (!Number.isInteger(invoiceId) || invoiceId <= 0) {
    return res.status(400).json({
      success: false,
      message: "Invalid invoice ID.",
    });
  }

  try {
    const ownerId = getOwnerId(req);
    const invoice = await invoiceModel.getInvoiceById(invoiceId, ownerId);

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found.",
      });
    }

    if (invoice.status !== "Draft") {
      return res.status(409).json({
        success: false,
        message: "Only draft invoices can be deleted.",
      });
    }

    const deleted = await invoiceModel.deleteInvoice(invoiceId, ownerId);
    if (!deleted) {
      return res.status(409).json({
        success: false,
        message: "Only draft invoices can be deleted.",
      });
    }

    await createAuditLog({
      userId: req.user.user_id,
      userRole: req.user.role,
      action: "Invoice Deleted",
      recordId: invoiceId,
      details: `Deleted invoice ${invoice.invoice_number || invoiceId}.`,
    });

    return res.status(200).json({
      success: true,
      message: "Draft invoice deleted successfully.",
    });
  } catch (error) {
    console.error("Delete invoice error:", error);

    if (error.code === "INVOICE_HAS_PAYMENTS") {
      return res.status(409).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to delete invoice.",
    });
  }
}

// Validate and record a payment against an invoice balance.
async function recordPayment(req, res) {
  const invoiceId = Number(req.params.id);
  if (!Number.isInteger(invoiceId) || invoiceId <= 0) {
    return res.status(400).json({
      success: false,
      message: "Invalid invoice ID.",
    });
  }

  const payment = req.body || {};
  const amount = Number(payment.amount);
  const paymentDate = payment.payment_date;
  // Match the payment methods allowed by the payments table enum.
  const paymentMethods = [
    "Cash",
    "Bank Transfer",
    "Card",
    "Online",
    "Other",
  ];

  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({
      success: false,
      message: "Payment amount must be greater than zero.",
    });
  }

  if (
    typeof paymentDate !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(paymentDate) ||
    Number.isNaN(Date.parse(`${paymentDate}T00:00:00Z`)) ||
    new Date(`${paymentDate}T00:00:00Z`).toISOString().slice(0, 10) !==
      paymentDate
  ) {
    return res.status(400).json({
      success: false,
      message: "Invalid payment_date. Use YYYY-MM-DD format.",
    });
  }

  if (
    payment.payment_method !== undefined &&
    !paymentMethods.includes(payment.payment_method)
  ) {
    return res.status(400).json({
      success: false,
      message: "Invalid payment method.",
    });
  }

  for (const field of ["reference_number", "notes"]) {
    if (
      payment[field] !== undefined &&
      payment[field] !== null &&
      typeof payment[field] !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: `${field} must be a string.`,
      });
    }
  }

  try {
    const result = await invoiceModel.recordInvoicePayment(
      invoiceId,
      { ...payment, amount },
      getOwnerId(req),
      req.user.user_id
    );

    if (!result) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found.",
      });
    }

    await createAuditLog({
      userId: req.user.user_id,
      userRole: req.user.role,
      action: "Invoice Payment Recorded",
      recordId: invoiceId,
      details: `Recorded payment ${result.payment_id} of ${amount} for invoice ${invoiceId}.`,
    });

    return res.status(201).json({
      success: true,
      message:
        result.status === "Paid"
          ? "Payment recorded. Invoice is fully paid."
          : "Payment recorded successfully.",
      payment: result,
    });
  } catch (error) {
    console.error("Record invoice payment error:", error);

    if (error.code === "PAYMENT_EXCEEDS_BALANCE") {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    if (error.code === "INVOICE_CANCELLED") {
      return res.status(409).json({
        success: false,
        message: error.message,
      });
    }

    if (error.code === "ER_NO_REFERENCED_ROW_2") {
      return res.status(400).json({
        success: false,
        message: "Invalid invoice or received-by user reference.",
      });
    }

    if (error.code === "ER_TRUNCATED_WRONG_VALUE_FOR_FIELD") {
      return res.status(500).json({
        success: false,
        message:
          "Invoice status schema is not updated. Apply the invoice status migration before recording full payments.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to record invoice payment.",
    });
  }
}

module.exports = {
  getInvoices,
  getPendingInvoiceApprovals,
  getInvoice,
  addInvoice,
  approveInvoice,
  rejectInvoice,
  editInvoice,
  removeInvoice,
  getInvoicePdf,
  sendInvoiceEmail,
  recordPayment,
};
