const db = require("../config/db");

const {
  getAllQuotations,
  getQuotationById,
  createQuotationWithItems,
  updateQuotationWithItems,
  deleteQuotationById,
} = require("../models/quotationModel");

const { getActiveServices } = require("../models/serviceCatalogModel");
const { createAuditLog } = require("../models/auditLogModel");

// --------------------------------------------------
// Helpers
// --------------------------------------------------

function isValidDate(value) {
  if (!value || typeof value !== "string") return false;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const date = new Date(`${value}T00:00:00.000Z`);

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

function addProjectDuration(startDate, duration, unit) {
  if (
    !startDate ||
    duration === null ||
    duration === undefined ||
    duration === ""
  ) {
    return null;
  }

  const amount = Number(duration);

  if (!Number.isFinite(amount) || amount < 0) return null;

  const date = new Date(`${startDate}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) return null;

  if (unit === "Days") {
    date.setUTCDate(date.getUTCDate() + amount);
  } else if (unit === "Weeks") {
    date.setUTCDate(date.getUTCDate() + amount * 7);
  } else if (unit === "Months") {
    date.setUTCMonth(date.getUTCMonth() + amount);
  } else {
    return null;
  }

  return date.toISOString().slice(0, 10);
}

// --------------------------------------------------
// Validate quotation and customer data
// --------------------------------------------------

function validateQuotationData(body) {
  const {
    quotation_number,
    customer_id,
    customer_name,
    company_name,
    email,
    phone,
    address,
    city,
    country,
    tax_number,
    customer_notes,
    quotation_date,
    project_start_date,
    estimated_duration,
    duration_unit,
    valid_until,
    currency,
    discount_amount,
    notes,
    terms_and_conditions,
    items,
    status,
    approval_status,
  } = body || {};

  const errors = [];

  if (
    !quotation_number ||
    typeof quotation_number !== "string" ||
    !quotation_number.trim()
  ) {
    errors.push("Quotation number is required.");
  }

  let normalizedCustomerId = null;

  if (
    customer_id !== undefined &&
    customer_id !== null &&
    String(customer_id).trim() !== ""
  ) {
    normalizedCustomerId = Number(customer_id);

    if (
      !Number.isInteger(normalizedCustomerId) ||
      normalizedCustomerId <= 0
    ) {
      errors.push("Customer ID must be a valid positive integer.");
    }
  } else if (
    typeof customer_name !== "string" ||
    !customer_name.trim()
  ) {
    errors.push(
      "Customer name is required when creating a quotation without a customer ID."
    );
  }

  if (!isValidDate(quotation_date)) {
    errors.push("A valid quotation date is required (YYYY-MM-DD).");
  }

  if (project_start_date && !isValidDate(project_start_date)) {
    errors.push("Project start date must use YYYY-MM-DD format.");
  }

  if (valid_until && !isValidDate(valid_until)) {
    errors.push("Valid until date must use YYYY-MM-DD format.");
  }

  const allowedStatuses = [
    "Draft",
    "Sent",
    "Approved",
    "Rejected",
    "Expired",
    "Cancelled",
  ];

  const allowedApprovalStatuses = [
    "Not Required",
    "Pending",
    "Approved",
    "Rejected",
  ];

  if (status && !allowedStatuses.includes(status)) {
    errors.push("Invalid quotation status.");
  }

  if (
    approval_status &&
    !allowedApprovalStatuses.includes(approval_status)
  ) {
    errors.push("Invalid approval status.");
  }

  let duration = null;

  if (
    estimated_duration !== undefined &&
    estimated_duration !== null &&
    estimated_duration !== ""
  ) {
    duration = Number(estimated_duration);

    if (!Number.isFinite(duration) || duration < 0) {
      errors.push("Estimated duration must be a non-negative number.");
    }
  }

  if (
    duration !== null &&
    !["Days", "Weeks", "Months"].includes(duration_unit)
  ) {
    errors.push("Duration unit must be Days, Weeks, or Months.");
  }

  if (
    duration === null &&
    duration_unit &&
    !["Days", "Weeks", "Months"].includes(duration_unit)
  ) {
    errors.push("Invalid duration unit.");
  }

  const normalizedCurrency = String(currency || "LKR")
    .trim()
    .toUpperCase();

  if (!/^[A-Z]{3}$/.test(normalizedCurrency)) {
    errors.push("Currency must be a valid three-letter currency code.");
  }

  const discount = Number(discount_amount ?? 0);

  if (!Number.isFinite(discount) || discount < 0) {
    errors.push("Discount amount must be a non-negative number.");
  }

  if (!Array.isArray(items) || items.length === 0) {
    errors.push("At least one quotation item is required.");
  }

  let subtotal = 0;
  let totalTax = 0;
  const normalizedItems = [];

  if (Array.isArray(items)) {
    items.forEach((item, index) => {
      const itemName = String(item?.item_name || "").trim();
      const unitPrice = Number(item?.unit_price);
      const taxRate = Number(item?.tax_rate ?? 0);

      if (!itemName) {
        errors.push(`Item ${index + 1}: item name is required.`);
      }

      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        errors.push(
          `Item ${index + 1}: unit price must be non-negative.`
        );
      }

      if (
        !Number.isFinite(taxRate) ||
        taxRate < 0 ||
        taxRate > 100
      ) {
        errors.push(
          `Item ${index + 1}: tax rate must be between 0 and 100.`
        );
      }

      if (
        itemName &&
        Number.isFinite(unitPrice) &&
        unitPrice >= 0 &&
        Number.isFinite(taxRate) &&
        taxRate >= 0 &&
        taxRate <= 100
      ) {
        const lineTax = (unitPrice * taxRate) / 100;
        const lineTotal = Number((unitPrice + lineTax).toFixed(2));

        subtotal += unitPrice;
        totalTax += lineTax;

        normalizedItems.push({
          item_name: itemName,
          description: item.description || null,
          technology: item.technology || null,
          website_type: item.website_type || null,
          hosting_domain: item.hosting_domain || null,
          unit_price: Number(unitPrice.toFixed(2)),
          tax_rate: Number(taxRate.toFixed(2)),
          line_total: lineTotal,
        });
      }
    });
  }

  if (discount > subtotal) {
    errors.push("Discount amount cannot exceed subtotal.");
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  subtotal = Number(subtotal.toFixed(2));
  totalTax = Number(totalTax.toFixed(2));

  const total = Number(
    (subtotal - discount + totalTax).toFixed(2)
  );

  const startDate = project_start_date || quotation_date;

  const completionDate = addProjectDuration(
    startDate,
    duration,
    duration_unit
  );

  return {
    valid: true,
    items: normalizedItems,
    data: {
      quotation_number: quotation_number.trim(),
      customer_id: normalizedCustomerId,
      customer_name: customer_name?.trim() || null,
      company_name: company_name?.trim() || null,
      email: email?.trim() || null,
      phone: phone?.trim() || null,
      address: address?.trim() || null,
      city: city?.trim() || null,
      country: country?.trim() || null,
      tax_number: tax_number?.trim() || null,
      customer_notes: customer_notes?.trim() || null,
      quotation_date,
      project_start_date: startDate,
      estimated_duration: duration,
      duration_unit: duration_unit || null,
      estimated_completion_date: completionDate,
      valid_until: valid_until || null,
      currency: normalizedCurrency,
      subtotal,
      discount_amount: Number(discount.toFixed(2)),
      tax_amount: totalTax,
      total_amount: total,
      status: status || "Draft",
      approval_status: approval_status || "Not Required",
      notes: notes || null,
      terms_and_conditions: terms_and_conditions || null,
    },
  };
}

function sendValidationErrors(res, errors) {
  return res.status(400).json({
    success: false,
    message: "Quotation validation failed.",
    errors,
  });
}

// --------------------------------------------------
// Get quotation item options
// --------------------------------------------------

async function getQuotationItemOptions(req, res) {
  try {
    const services = await getActiveServices();

    return res.status(200).json({
      success: true,
      services,
    });
  } catch (error) {
    console.error("Get quotation item options error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve quotation item options.",
    });
  }
}

// --------------------------------------------------
// Get quotations with filters
// --------------------------------------------------

async function getQuotations(req, res) {
  try {
    const {
      period,
      status,
      approval_status,
      search,
      from_date,
      to_date,
    } = req.query;

    const quotations = await getAllQuotations({
      period,
      status,
      approval_status,
      search,
      from_date,
      to_date,
    });

    return res.status(200).json({
      success: true,
      count: quotations.length,
      quotations,
    });
  } catch (error) {
    console.error("Get quotations error:", error);

    return res.status(400).json({
      success: false,
      message: error.message || "Failed to retrieve quotations.",
    });
  }
}

// --------------------------------------------------
// Get one quotation
// --------------------------------------------------

async function getQuotation(req, res) {
  try {
    const quotationId = Number(req.params.id);

    if (!Number.isInteger(quotationId) || quotationId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid quotation ID.",
      });
    }

    const quotation = await getQuotationById(quotationId);

    if (!quotation) {
      return res.status(404).json({
        success: false,
        message: "Quotation not found.",
      });
    }

    return res.status(200).json({
      success: true,
      quotation,
    });
  } catch (error) {
    console.error("Get quotation error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve quotation.",
    });
  }
}

// --------------------------------------------------
// Create quotation
// --------------------------------------------------

async function addQuotation(req, res) {
  try {
    const result = validateQuotationData(req.body);

    if (!result.valid) {
      return sendValidationErrors(res, result.errors);
    }

    if (["Approved", "Rejected"].includes(result.data.status)) {
      return res.status(400).json({
        success: false,
        message:
          "A quotation cannot be approved or rejected during creation.",
      });
    }

    const userId = req.user?.user_id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authenticated user information is missing.",
      });
    }

    result.data.approval_status = "Not Required";

    const quotationId = await createQuotationWithItems(
      {
        ...result.data,
        created_by: userId,
      },
      result.items
    );

    await createAuditLog({
      userId,
      userRole: req.user.role,
      action: "Quotation Created",
      recordId: quotationId,
      details: `Created quotation ${result.data.quotation_number} for ${result.data.customer_name}.`,
    });

    return res.status(201).json({
      success: true,
      message: "Quotation created successfully.",
      quotation_id: quotationId,
      status: result.data.status,
      approval_status: result.data.approval_status,
      totals: {
        subtotal: result.data.subtotal,
        discount_amount: result.data.discount_amount,
        tax_amount: result.data.tax_amount,
        total_amount: result.data.total_amount,
      },
    });
  } catch (error) {
    console.error("Create quotation error:", error);

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "This quotation number already exists.",
      });
    }

    if (
      error.message === "Selected customer was not found." ||
      error.message === "Customer name is required."
    ) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to create quotation.",
    });
  }
}

// --------------------------------------------------
// Update quotation
// --------------------------------------------------

async function updateQuotation(req, res) {
  try {
    const quotationId = Number(req.params.id);

    if (!Number.isInteger(quotationId) || quotationId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid quotation ID.",
      });
    }

    const existing = await getQuotationById(quotationId);

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Quotation not found.",
      });
    }

    const result = validateQuotationData(req.body);

    if (!result.valid) {
      return sendValidationErrors(res, result.errors);
    }

    if (["Approved", "Rejected"].includes(result.data.status)) {
      return res.status(400).json({
        success: false,
        message:
          "Use the approval endpoint to approve or reject a quotation.",
      });
    }

    if (
      ["Pending", "Approved", "Rejected"].includes(
        existing.approval_status
      )
    ) {
      result.data.approval_status = "Not Required";
    }

    const updated = await updateQuotationWithItems(
      quotationId,
      result.data,
      result.items
    );

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: "Quotation not found.",
      });
    }

    await createAuditLog({
      userId: req.user?.user_id,
      userRole: req.user?.role,
      action: "Quotation Updated",
      recordId: quotationId,
      details: `Updated quotation ${result.data.quotation_number} for ${result.data.customer_name}.`,
    });

    return res.status(200).json({
      success: true,
      message: "Quotation updated successfully.",
      quotation_id: quotationId,
      status: result.data.status,
      approval_status: result.data.approval_status,
      totals: {
        subtotal: result.data.subtotal,
        discount_amount: result.data.discount_amount,
        tax_amount: result.data.tax_amount,
        total_amount: result.data.total_amount,
      },
    });
  } catch (error) {
    console.error("Update quotation error:", error);

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "This quotation number already exists.",
      });
    }

    if (
      error.message === "Selected customer was not found." ||
      error.message === "Customer name is required."
    ) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to update quotation.",
    });
  }
}

// --------------------------------------------------
// Delete quotation
// --------------------------------------------------

async function deleteQuotation(req, res) {
  try {
    const quotationId = Number(req.params.id);

    if (!Number.isInteger(quotationId) || quotationId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid quotation ID.",
      });
    }

    const result = await deleteQuotationById(quotationId);

    if (!result.deleted) {
      if (result.reason === "not_found") {
        return res.status(404).json({
          success: false,
          message: "Quotation not found.",
        });
      }

      if (result.reason === "linked_invoice") {
        return res.status(409).json({
          success: false,
          message:
            "This quotation cannot be deleted because an invoice is linked to it.",
        });
      }

      return res.status(400).json({
        success: false,
        message: "Quotation could not be deleted.",
      });
    }

    await createAuditLog({
      userId: req.user?.user_id,
      userRole: req.user?.role,
      action: "Quotation Deleted",
      recordId: quotationId,
      details: "Deleted quotation.",
    });

    return res.status(200).json({
      success: true,
      message: "Quotation deleted successfully.",
    });
  } catch (error) {
    console.error("Delete quotation error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete quotation.",
    });
  }
}

// --------------------------------------------------
// Submit quotation for approval
// --------------------------------------------------

async function submitQuotationForApproval(req, res) {
  try {
    const quotationId = Number(req.params.id);

    if (!Number.isInteger(quotationId) || quotationId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid quotation ID.",
      });
    }

    const quotation = await getQuotationById(quotationId);

    if (!quotation) {
      return res.status(404).json({
        success: false,
        message: "Quotation not found.",
      });
    }

    if (
      ["Approved", "Rejected", "Cancelled", "Expired"].includes(
        quotation.status
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "This quotation cannot be submitted for approval in its current status.",
      });
    }

    const [result] = await db.execute(
      `UPDATE quotations
       SET status = 'Sent',
           approval_status = 'Pending'
       WHERE quotation_id = ?
         AND approval_status <> 'Pending'`,
      [quotationId]
    );

    if (result.affectedRows === 0) {
      return res.status(409).json({
        success: false,
        message: "This quotation is already pending approval.",
      });
    }

    await createAuditLog({
      userId: req.user?.user_id,
      userRole: req.user?.role,
      action: "Quotation Submitted for Approval",
      recordId: quotationId,
      details: `Submitted quotation ${quotation.quotation_number} for approval.`,
    });

    return res.status(200).json({
      success: true,
      message: "Quotation submitted for approval successfully.",
      quotation_id: quotationId,
      status: "Sent",
      approval_status: "Pending",
    });
  } catch (error) {
    console.error("Submit quotation for approval error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to submit quotation for approval.",
    });
  }
}

// --------------------------------------------------
// Super Admin: Approve quotation
// --------------------------------------------------

async function approveQuotation(req, res) {
  try {
    if (req.user?.role !== "Super Admin") {
      return res.status(403).json({
        success: false,
        message: "Only Super Admin can approve quotations.",
      });
    }

    const quotationId = Number(req.params.id);

    if (!Number.isInteger(quotationId) || quotationId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid quotation ID.",
      });
    }

    const [result] = await db.execute(
      `UPDATE quotations
       SET status = 'Approved',
           approval_status = 'Approved'
       WHERE quotation_id = ?
         AND approval_status = 'Pending'`,
      [quotationId]
    );

    if (result.affectedRows === 0) {
      const quotation = await getQuotationById(quotationId);

      if (!quotation) {
        return res.status(404).json({
          success: false,
          message: "Quotation not found.",
        });
      }

      return res.status(409).json({
        success: false,
        message: "Only quotations pending approval can be approved.",
      });
    }

    await createAuditLog({
      userId: req.user?.user_id,
      userRole: req.user?.role,
      action: "Quotation Approved",
      recordId: quotationId,
      details: "Approved quotation.",
    });

    return res.status(200).json({
      success: true,
      message: "Quotation approved successfully.",
      quotation_id: quotationId,
      status: "Approved",
      approval_status: "Approved",
    });
  } catch (error) {
    console.error("Approve quotation error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to approve quotation.",
    });
  }
}

// --------------------------------------------------
// Super Admin: Reject quotation
// --------------------------------------------------

async function rejectQuotation(req, res) {
  try {
    if (req.user?.role !== "Super Admin") {
      return res.status(403).json({
        success: false,
        message: "Only Super Admin can reject quotations.",
      });
    }

    const quotationId = Number(req.params.id);

    if (!Number.isInteger(quotationId) || quotationId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid quotation ID.",
      });
    }

    const [result] = await db.execute(
      `UPDATE quotations
       SET status = 'Rejected',
           approval_status = 'Rejected'
       WHERE quotation_id = ?
         AND approval_status = 'Pending'`,
      [quotationId]
    );

    if (result.affectedRows === 0) {
      const quotation = await getQuotationById(quotationId);

      if (!quotation) {
        return res.status(404).json({
          success: false,
          message: "Quotation not found.",
        });
      }

      return res.status(409).json({
        success: false,
        message: "Only quotations pending approval can be rejected.",
      });
    }

    await createAuditLog({
      userId: req.user?.user_id,
      userRole: req.user?.role,
      action: "Quotation Rejected",
      recordId: quotationId,
      details: "Rejected quotation.",
    });

    return res.status(200).json({
      success: true,
      message: "Quotation rejected successfully.",
      quotation_id: quotationId,
      status: "Rejected",
      approval_status: "Rejected",
    });
  } catch (error) {
    console.error("Reject quotation error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to reject quotation.",
    });
  }
}

// --------------------------------------------------
// Update quotation status
// Draft and Sent only.
// --------------------------------------------------

async function updateQuotationStatus(req, res) {
  try {
    const quotationId = Number(req.params.id);
    const { status } = req.body || {};

    const allowedStatuses = ["Draft", "Sent"];

    if (!Number.isInteger(quotationId) || quotationId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid quotation ID.",
      });
    }

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message:
          "Status must be Draft or Sent. Use approval endpoints for Approved or Rejected.",
      });
    }

    const quotation = await getQuotationById(quotationId);

    if (!quotation) {
      return res.status(404).json({
        success: false,
        message: "Quotation not found.",
      });
    }

    if (
      ["Approved", "Rejected", "Cancelled", "Expired"].includes(
        quotation.status
      ) ||
      quotation.approval_status === "Pending"
    ) {
      return res.status(409).json({
        success: false,
        message:
          "This quotation status cannot be changed through this endpoint.",
      });
    }

    await db.execute(
      `UPDATE quotations
       SET status = ?
       WHERE quotation_id = ?`,
      [status, quotationId]
    );

    await createAuditLog({
      userId: req.user?.user_id,
      userRole: req.user?.role,
      action: "Quotation Status Updated",
      recordId: quotationId,
      details: `Changed quotation status from ${quotation.status} to ${status}.`,
    });

    return res.status(200).json({
      success: true,
      message: "Quotation status updated successfully.",
      quotation_id: quotationId,
      status,
    });
  } catch (error) {
    console.error("Update quotation status error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update quotation status.",
    });
  }
}

// --------------------------------------------------
// Customer: Update quotation response status
// --------------------------------------------------

async function updateCustomerQuotationStatus(req, res) {
  try {
    const quotationId = Number(req.params.id);
    const { customer_status: customerStatus } = req.body || {};

    const allowedStatuses = [
      "Not Sent",
      "Sent to Customer",
      "Customer Accepted",
      "Customer Rejected",
    ];

    if (!Number.isInteger(quotationId) || quotationId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid quotation ID.",
      });
    }

    if (!allowedStatuses.includes(customerStatus)) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid customer status. Allowed: Not Sent, Sent to Customer, Customer Accepted, Customer Rejected.",
      });
    }

    const quotation = await getQuotationById(quotationId);

    if (!quotation) {
      return res.status(404).json({
        success: false,
        message: "Quotation not found.",
      });
    }

    await db.execute(
      `UPDATE quotations
       SET customer_status = ?
       WHERE quotation_id = ?`,
      [customerStatus, quotationId]
    );

    await createAuditLog({
      userId: req.user?.user_id,
      userRole: req.user?.role,
      action: "Customer Quotation Status Updated",
      recordId: quotationId,
      details: `Changed customer response status to ${customerStatus}.`,
    });

    return res.status(200).json({
      success: true,
      message: "Customer quotation status updated successfully.",
      quotation_id: quotationId,
      customer_status: customerStatus,
    });
  } catch (error) {
    console.error("Update customer quotation status error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update customer quotation status.",
    });
  }
}

// --------------------------------------------------
// Exports
// --------------------------------------------------

module.exports = {
  getQuotationItemOptions,
  getQuotations,
  getQuotation,
  addQuotation,
  updateQuotation,
  deleteQuotation,
  submitQuotationForApproval,
  approveQuotation,
  rejectQuotation,
  updateQuotationStatus,
  updateCustomerQuotationStatus, // Exported here
};