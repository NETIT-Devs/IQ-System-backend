const {
  getAllQuotations,
  createQuotation,
  addQuotationItems,
} = require("../models/quotationModel");

// Get all quotations
async function getQuotations(req, res) {
  try {
    const quotations = await getAllQuotations();

    console.log(
      "API DEBUG:",
      JSON.stringify(
        quotations.find((q) => Number(q.quotation_id) === 6),
        null,
        2
      )
    );

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

// Create a quotation with its items
async function addQuotation(req, res) {
  try {
    const {
      quotation_number,
      customer_id,
      quotation_date,
      valid_until,
      status,
      currency,
      subtotal,
      discount_amount,
      tax_amount,
      total_amount,
      notes,
      terms_and_conditions,
      items,
    } = req.body;

    if (
      typeof quotation_number !== "string" ||
      !quotation_number.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "Quotation number is required.",
      });
    }

    if (
      !Number.isInteger(Number(customer_id)) ||
      Number(customer_id) <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: "A valid customer ID is required.",
      });
    }

    const validDate = (date) =>
      typeof date === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(date) &&
      !Number.isNaN(Date.parse(`${date}T00:00:00Z`)) &&
      new Date(`${date}T00:00:00Z`)
        .toISOString()
        .slice(0, 10) === date;

    if (!validDate(quotation_date)) {
      return res.status(400).json({
        success: false,
        message:
          "A valid quotation date (YYYY-MM-DD) is required.",
      });
    }

    if (
      valid_until != null &&
      valid_until !== "" &&
      !validDate(valid_until)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "A valid expiry date (YYYY-MM-DD) is required.",
      });
    }

    const validStatuses = [
      "Draft",
      "Sent",
      "Accepted",
      "Rejected",
      "Expired",
      "Converted",
      "Cancelled",
    ];

    if (status != null && !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid quotation status.",
      });
    }

    const amounts = [
      subtotal ?? 0,
      discount_amount ?? 0,
      tax_amount ?? 0,
      total_amount ?? 0,
    ];

    if (
      amounts.some(
        (amount) =>
          (typeof amount !== "number" &&
            typeof amount !== "string") ||
          String(amount).trim() === "" ||
          !Number.isFinite(Number(amount)) ||
          Number(amount) < 0 ||
          !/^\d+(\.\d{1,2})?$/.test(String(amount))
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Quotation amounts must be non-negative numbers with up to 2 decimal places.",
      });
    }

    if (
      currency != null &&
      (typeof currency !== "string" ||
        !/^[A-Za-z]{3}$/.test(currency))
    ) {
      return res.status(400).json({
        success: false,
        message: "Currency must be a 3-letter code.",
      });
    }

    if (items != null) {
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Items must be a non-empty array.",
        });
      }

      for (const item of items) {
        if (
          !item ||
          typeof item.item_name !== "string" ||
          !item.item_name.trim()
        ) {
          return res.status(400).json({
            success: false,
            message: "Each item requires an item name.",
          });
        }

        const quantity = Number(item.quantity);
        const unitPrice = Number(item.unit_price);
        const taxRate = Number(item.tax_rate ?? 0);

        if (
          item.quantity == null ||
          String(item.quantity).trim() === "" ||
          !Number.isFinite(quantity) ||
          quantity <= 0 ||
          !/^\d+(\.\d{1,3})?$/.test(String(item.quantity))
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Item quantity must be positive with up to 3 decimal places.",
          });
        }

        if (
          item.unit_price == null ||
          String(item.unit_price).trim() === "" ||
          !Number.isFinite(unitPrice) ||
          unitPrice < 0 ||
          !/^\d+(\.\d{1,2})?$/.test(String(item.unit_price))
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Item unit price must be non-negative with up to 2 decimal places.",
          });
        }

        if (
          !Number.isFinite(taxRate) ||
          taxRate < 0 ||
          taxRate > 100 ||
          !/^\d+(\.\d{1,2})?$/.test(
            String(item.tax_rate ?? 0)
          )
        ) {
          return res.status(400).json({
            success: false,
            message: "Item tax rate must be between 0 and 100.",
          });
        }

        if (
          item.description != null &&
          typeof item.description !== "string"
        ) {
          return res.status(400).json({
            success: false,
            message: "Item description must be text.",
          });
        }
      }
    }

    const userId = req.user?.user_id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    console.log("DEBUG items:", JSON.stringify(items));

    const quotationId = await createQuotation({
      quotation_number: quotation_number.trim(),
      customer_id: Number(customer_id),
      created_by: userId,
      quotation_date,
      valid_until: valid_until || null,
      status: status || "Draft",
      currency: currency ? currency.toUpperCase() : "LKR",
      subtotal: Number(subtotal ?? 0),
      discount_amount: Number(discount_amount ?? 0),
      tax_amount: Number(tax_amount ?? 0),
      total_amount: Number(total_amount ?? 0),
      notes,
      terms_and_conditions,
    });

    if (Array.isArray(items) && items.length > 0) {
      await addQuotationItems(quotationId, items);

      console.log(
        `SUCCESS: Saved ${items.length} item(s) for quotation ${quotationId}`
      );
    } else {
      console.log("WARNING: No quotation items received.");
    }

    return res.status(201).json({
      success: true,
      message: "Quotation created successfully.",
      quotation_id: quotationId,
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
        message:
          "The selected customer or related record does not exist.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to create quotation.",
    });
  }
}

module.exports = {
  getQuotations,
  addQuotation,
};