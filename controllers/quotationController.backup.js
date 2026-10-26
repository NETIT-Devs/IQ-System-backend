const { getCompanySettings } = require("../models/companySettingsModel");
const {
  getAllQuotations,
  getQuotationById,
  createQuotationWithItems,
  updateQuotationWithItems,
  deleteQuotationById,
} = require("../models/quotationModel");

const { getActiveServices } = require("../models/serviceCatalogModel");

// Validate YYYY-MM-DD dates
function isValidDate(date) {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return false;
  }

  const parsed = new Date(`${date}T00:00:00Z`);

  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === date
  );
}

// Calculate project completion date from start date and duration
function addProjectDuration(startDate, duration, unit) {
  const date = new Date(`${startDate}T00:00:00Z`);

  if (unit === "Days") {
    date.setUTCDate(date.getUTCDate() + duration);
  } else if (unit === "Weeks") {
    date.setUTCDate(date.getUTCDate() + duration * 7);
  } else if (unit === "Months") {
    const originalDay = date.getUTCDate();

    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + duration);

    const lastDay = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)
    ).getUTCDate();

    date.setUTCDate(Math.min(originalDay, lastDay));
  }

  return date.toISOString().slice(0, 10);
}

// Validate quotation data and calculate totals
function validateQuotationData(body) {
  const {
    quotation_number,
    customer_id,
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
  } = body || {};

  if (
    typeof quotation_number !== "string" ||
    !quotation_number.trim()
  ) {
    return { error: "Quotation number is required." };
  }

  if (quotation_number.trim().length > 50) {
    return { error: "Quotation number cannot exceed 50 characters." };
  }

  const customerId = Number(customer_id);

  if (!Number.isSafeInteger(customerId) || customerId <= 0) {
    return { error: "A valid customer ID is required." };
  }

  if (!isValidDate(quotation_date)) {
    return {
      error: "A valid quotation date (YYYY-MM-DD) is required.",
    };
  }

  const projectStartDate =
    project_start_date == null || project_start_date === ""
      ? quotation_date
      : project_start_date;

  if (!isValidDate(projectStartDate)) {
    return {
      error: "A valid project start date (YYYY-MM-DD) is required.",
    };
  }

  if (
    valid_until != null &&
    valid_until !== "" &&
    !isValidDate(valid_until)
  ) {
    return { error: "A valid expiry date (YYYY-MM-DD) is required." };
  }

  if (valid_until && valid_until < quotation_date) {
    return {
      error: "Expiry date cannot be before the quotation date.",
    };
  }

  if (
    currency != null &&
    (typeof currency !== "string" ||
      !/^[A-Za-z]{3}$/.test(currency))
  ) {
    return { error: "Currency must be a 3-letter code." };
  }

  const discountInput = discount_amount ?? 0;
  const discount = Number(discountInput);

  if (
    String(discountInput).trim() === "" ||
    !Number.isFinite(discount) ||
    discount < 0 ||
    !/^\d+(\.\d{1,2})?$/.test(String(discountInput))
  ) {
    return {
      error:
        "Discount must be a non-negative amount with up to 2 decimal places.",
    };
  }

  // Duration and duration unit must be supplied together.
  const hasDuration =
    estimated_duration != null &&
    String(estimated_duration).trim() !== "";

  const hasDurationUnit =
    typeof duration_unit === "string" &&
    duration_unit.trim() !== "";

  let projectDuration = null;
  let projectDurationUnit = null;
  let estimatedCompletionDate = null;

  if (hasDuration || hasDurationUnit) {
    if (!hasDuration || !hasDurationUnit) {
      return {
        error: "Select both project duration and duration unit.",
      };
    }

    projectDuration = Number(estimated_duration);

    if (
      !Number.isSafeInteger(projectDuration) ||
      projectDuration <= 0 ||
      projectDuration > 3650
    ) {
      return {
        error:
          "Project duration must be a whole number between 1 and 3650.",
      };
    }

    if (!["Days", "Weeks", "Months"].includes(duration_unit)) {
      return {
        error: "Duration unit must be Days, Weeks, or Months.",
      };
    }

    projectDurationUnit = duration_unit;

    estimatedCompletionDate = addProjectDuration(
      projectStartDate,
      projectDuration,
      projectDurationUnit
    );
  }

  if (!Array.isArray(items) || items.length === 0) {
    return { error: "Add at least one service to the quotation." };
  }

  if (items.length > 100) {
    return {
      error: "A quotation cannot contain more than 100 items.",
    };
  }

  let subtotal = 0;
  let taxAmount = 0;
  const validatedItems = [];

  for (const item of items) {
    if (
      !item ||
      typeof item.item_name !== "string" ||
      !item.item_name.trim()
    ) {
      return { error: "Each service requires an item name." };
    }

    const itemName = item.item_name.trim();

    if (itemName.length > 255) {
      return { error: "Service name cannot exceed 255 characters." };
    }

    // One service line = one price. Quantity is not used.
    const unitPrice = Number(item.unit_price);

    if (
      item.unit_price == null ||
      String(item.unit_price).trim() === "" ||
      !Number.isFinite(unitPrice) ||
      unitPrice < 0 ||
      !/^\d+(\.\d{1,2})?$/.test(String(item.unit_price))
    ) {
      return {
        error: "Price must be non-negative with up to 2 decimal places.",
      };
    }

    const taxInput = item.tax_rate ?? 0;
    const taxRate = Number(taxInput);

    if (
      !Number.isFinite(taxRate) ||
      taxRate < 0 ||
      taxRate > 100 ||
      !/^\d+(\.\d{1,2})?$/.test(String(taxInput))
    ) {
      return { error: "Tax rate must be between 0 and 100." };
    }

    if (
      item.description != null &&
      typeof item.description !== "string"
    ) {
      return { error: "Description must be text." };
    }

    if (
      typeof item.description === "string" &&
      item.description.length > 10000
    ) {
      return { error: "Description cannot exceed 10000 characters." };
    }

    const technology = item.technology ?? null;

    if (
      technology != null &&
      (typeof technology !== "string" ||
        technology.trim().length > 100)
    ) {
      return { error: "Technology must be text up to 100 characters." };
    }

    const websiteType = item.website_type ?? null;

    if (
      websiteType != null &&
      (typeof websiteType !== "string" ||
        websiteType.trim().length > 150)
    ) {
      return {
        error: "Website type must be text up to 150 characters.",
      };
    }

    const hostingDomain = item.hosting_domain ?? null;

    if (
      hostingDomain != null &&
      (typeof hostingDomain !== "string" ||
        hostingDomain.trim().length > 1000)
    ) {
      return {
        error:
          "Hosting and domain details must be text up to 1000 characters.",
      };
    }

    const baseAmount = Number(unitPrice.toFixed(2));
    const itemTax = Number(((baseAmount * taxRate) / 100).toFixed(2));

    subtotal += baseAmount;
    taxAmount += itemTax;

    validatedItems.push({
      item_name: itemName,
      description: item.description?.trim() || null,
      unit_price: baseAmount,
      tax_rate: taxRate,
      technology:
        typeof technology === "string"
          ? technology.trim() || null
          : null,
      website_type:
        typeof websiteType === "string"
          ? websiteType.trim() || null
          : null,
      hosting_domain:
        typeof hostingDomain === "string"
          ? hostingDomain.trim() || null
          : null,
    });
  }

  subtotal = Number(subtotal.toFixed(2));
  taxAmount = Number(taxAmount.toFixed(2));

  if (discount > subtotal) {
    return { error: "Discount cannot be greater than the subtotal." };
  }

  const finalDiscount = Number(discount.toFixed(2));

  const totalAmount = Number(
    (subtotal - finalDiscount + taxAmount).toFixed(2)
  );

  return {
    data: {
      quotation_number: quotation_number.trim(),
      customer_id: customerId,
      quotation_date,
      project_start_date: projectStartDate,
      estimated_duration: projectDuration,
      duration_unit: projectDurationUnit,
      estimated_completion_date: estimatedCompletionDate,
      valid_until: valid_until || null,
      currency: currency ? currency.toUpperCase() : "LKR",
      subtotal,
      discount_amount: finalDiscount,
      tax_amount: taxAmount,
      total_amount: totalAmount,
      notes: notes || null,
      terms_and_conditions: terms_and_conditions || null,
    },
    items: validatedItems,
    totals: {
      subtotal,
      discount_amount: finalDiscount,
      tax_amount: taxAmount,
      total_amount: totalAmount,
    },
  };
}

// Get active service options
async function getQuotationItemOptions(req, res) {
  try {
    const items = await getActiveServices();

    return res.status(200).json({
      success: true,
      items,
    });
  } catch (error) {
    console.error("Get quotation item options error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve service options.",
    });
  }
}

// Get all quotations
async function getQuotations(req, res) {
  try {
    const quotations = await getAllQuotations();

    return res.status(200).json({
      success: true,
      quotations,
    });
  } catch (error) {
    console.error("Get quotations error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve quotations.",
    });
  }
}

// Get one quotation by ID
async function getQuotation(req, res) {
  try {
    const quotationId = Number(req.params.id);

    if (!Number.isSafeInteger(quotationId) || quotationId <= 0) {
      return res.status(400).json({
        success: false,
        message: "A valid quotation ID is required.",
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
    console.error("Get quotation by ID error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve quotation.",
    });
  }
}

// Create quotation
async function addQuotation(req, res) {
  try {
    const result = validateQuotationData(req.body);

    if (result.error) {
      return res.status(400).json({
        success: false,
        message: result.error,
      });
    }

    const userId = req.user?.user_id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    const quotationId = await createQuotationWithItems(
      {
        ...result.data,
        created_by: userId,
      },
      result.items
    );

    return res.status(201).json({
      success: true,
      message: "Quotation created successfully.",
      quotation_id: quotationId,
      totals: result.totals,
    });
  } catch (error) {
    console.error("Create quotation error:", error);

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "Quotation number already exists.",
      });
    }

    if (
      error.code === "ER_NO_REFERENCED_ROW_2" ||
      error.code === "ER_ROW_IS_REFERENCED_2"
    ) {
      return res.status(400).json({
        success: false,
        message: "The selected customer or related record does not exist.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to create quotation.",
    });
  }
}

// Update quotation
async function updateQuotation(req, res) {
  try {
    const quotationId = Number(req.params.id);

    if (!Number.isSafeInteger(quotationId) || quotationId <= 0) {
      return res.status(400).json({
        success: false,
        message: "A valid quotation ID is required.",
      });
    }

    const result = validateQuotationData(req.body);

    if (result.error) {
      return res.status(400).json({
        success: false,
        message: result.error,
      });
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

    return res.status(200).json({
      success: true,
      message: "Quotation updated successfully.",
      totals: result.totals,
    });
  } catch (error) {
    console.error("Update quotation error:", error);

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "Quotation number already exists.",
      });
    }

    if (
      error.code === "ER_NO_REFERENCED_ROW_2" ||
      error.code === "ER_ROW_IS_REFERENCED_2"
    ) {
      return res.status(400).json({
        success: false,
        message: "The selected customer or related record does not exist.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to update quotation.",
    });
  }
}

// Delete quotation
async function deleteQuotation(req, res) {
  try {
    const quotationId = Number(req.params.id);

    if (!Number.isSafeInteger(quotationId) || quotationId <= 0) {
      return res.status(400).json({
        success: false,
        message: "A valid quotation ID is required.",
      });
    }

    const result = await deleteQuotationById(quotationId);

    if (result.reason === "not_found") {
      return res.status(404).json({
        success: false,
        message: "Quotation not found.",
      });
    }

    if (result.reason === "linked_invoice") {
      return res.status(409).json({
        success: false,
        message: "Cannot delete a quotation linked to an invoice.",
      });
    }

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

module.exports = {
  getQuotationItemOptions,
  getQuotations,
  getQuotation,
  addQuotation,
  updateQuotation,
  deleteQuotation,
};
