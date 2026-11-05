const db = require("../config/db");
const { createCustomer } = require("./customerModel");

// Whitelist invoice columns that can be inserted or updated.
const invoiceFields = [
  "invoice_number",
  "customer_id",
  "quotation_id",
  "invoice_date",
  "due_date",
  "currency",
  "subtotal",
  "discount_amount",
  "discount_type",
  "discount_value",
  "tax_amount",
  "total_amount",
  "amount_paid",
  "balance_due",
  "status",
  "notes",
  "terms_and_conditions",
];

// Build a parameterized field/value list for the invoice queries.
function getInvoiceValues(invoice) {
  const fields = invoiceFields.filter(
    (field) => invoice[field] !== undefined
  );
  return {
    fields,
    values: fields.map((field) => invoice[field]),
  };
}

// Round monetary values to the database's two-decimal precision.
function roundMoney(value) {
  return Number(value.toFixed(2));
}

// Calculate item totals, invoice taxes, discounts, and the remaining balance.
function calculateInvoiceAmounts(invoice, items) {
  let subtotal = 0;
  let taxAmount = 0;
  const calculatedItems = items.map((item) => {
    const unitPrice = Number(item.unit_price ?? item.price);
    const quantity = Number(item.quantity ?? 1);
    const taxRate = Number(item.tax_rate ?? 0);
    const itemSubtotal = roundMoney(unitPrice * quantity);
    const itemTax = roundMoney((itemSubtotal * taxRate) / 100);

    subtotal += itemSubtotal;
    taxAmount += itemTax;

    return {
      ...item,
      unit_price: roundMoney(unitPrice),
      tax_rate: roundMoney(taxRate),
      line_total: roundMoney(itemSubtotal + itemTax),
    };
  });

  subtotal = roundMoney(subtotal);
  taxAmount = roundMoney(taxAmount);

  const discountType = invoice.discount_type || "fixed";
  const discountValue = Number(
    invoice.discount_value ?? invoice.discount_amount ?? 0
  );
  const discountAmount =
    discountType === "percentage"
      ? roundMoney((subtotal * discountValue) / 100)
      : roundMoney(discountValue);

  if (discountAmount > subtotal) {
    const error = new Error("Discount cannot exceed the invoice subtotal.");
    error.code = "INVALID_INVOICE_DISCOUNT";
    throw error;
  }

  const totalAmount = roundMoney(subtotal - discountAmount + taxAmount);
  const amountPaid = roundMoney(Number(invoice.amount_paid ?? 0));

  if (amountPaid > totalAmount) {
    const error = new Error("Amount paid cannot exceed the invoice total.");
    error.code = "INVALID_INVOICE_PAYMENT";
    throw error;
  }

  return {
    invoice: {
      ...invoice,
      subtotal,
      discount_type: discountType,
      discount_value: discountValue,
      discount_amount: discountAmount,
      tax_amount: taxAmount,
      total_amount: totalAmount,
      amount_paid: amountPaid,
      balance_due: roundMoney(totalAmount - amountPaid),
    },
    items: calculatedItems,
  };
}

// Generate a unique yearly invoice number while holding a MySQL advisory lock.
async function generateInvoiceNumber(connection, invoiceDate) {
  const year = invoiceDate.slice(0, 4);
  const prefix = `INV-${year}-`;
  const lockName = `invoice-number-${year}`;
  const [lockRows] = await connection.execute(
    "SELECT GET_LOCK(?, 10) AS acquired",
    [lockName]
  );

  if (Number(lockRows[0]?.acquired) !== 1) {
    const error = new Error("Could not reserve an invoice number. Please retry.");
    error.code = "INVOICE_NUMBER_LOCK_TIMEOUT";
    throw error;
  }

  try {
    const [rows] = await connection.execute(
      `SELECT COALESCE(
         MAX(CAST(SUBSTRING(invoice_number, ?) AS UNSIGNED)),
         0
       ) AS max_sequence
       FROM invoices
       WHERE invoice_number LIKE ?`,
      [prefix.length + 1, `${prefix}%`]
    );
    const nextSequence = Number(rows[0]?.max_sequence || 0) + 1;

    return {
      invoiceNumber: `${prefix}${String(nextSequence).padStart(3, "0")}`,
      lockName,
    };
  } catch (error) {
    await connection.execute("SELECT RELEASE_LOCK(?)", [lockName]);
    throw error;
  }
}

// Normalize customer details supplied in supported invoice request formats.
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

// Use the selected customer or create one from the supplied customer details.
async function resolveCustomerId(connection, invoice) {
  if (invoice.customer_id) {
    return invoice.customer_id;
  }

  return createCustomer(
    {
      ...getCustomerData(invoice),
      created_by: invoice.created_by,
    },
    connection
  );
}

// Attach invoice line items to each invoice row.
async function addInvoiceItems(invoices) {
  for (const invoice of invoices) {
    const [items] = await db.execute(
      `SELECT
         invoice_item_id,
         invoice_id,
         item_name,
         description,
         price,
         price AS unit_price,
         tax_rate,
         line_total
       FROM invoice_items
       WHERE invoice_id = ?
       ORDER BY invoice_item_id ASC`,
      [invoice.invoice_id]
    );
    invoice.items = items;
  }
}

// List invoices, optionally restricted to the creating administrator.
async function getAllInvoices(createdBy) {
  const ownerCondition =
    createdBy === undefined || createdBy === null
      ? ""
      : "WHERE i.created_by = ?";
  const params =
    createdBy === undefined || createdBy === null ? [] : [createdBy];

  const [rows] = await db.execute(
    `SELECT
       i.*,
       c.customer_name,
       c.company_name AS customer_company,
       c.email AS customer_email,
       c.phone AS customer_phone,
       c.address AS customer_address
     FROM invoices i
     LEFT JOIN customers c
       ON i.customer_id = c.customer_id
     ${ownerCondition}
     ORDER BY i.invoice_id DESC`,
    params
  );

  await addInvoiceItems(rows);
  return rows;
}

// Retrieve one invoice and its line items, optionally checking its owner.
async function getInvoiceById(invoiceId, createdBy) {
  const ownerCondition =
    createdBy === undefined || createdBy === null
      ? ""
      : "AND i.created_by = ?";
  const params =
    createdBy === undefined || createdBy === null
      ? [invoiceId]
      : [invoiceId, createdBy];

  const [rows] = await db.execute(
    `SELECT
       i.*,
       c.customer_name,
       c.company_name AS customer_company,
       c.email AS customer_email,
       c.phone AS customer_phone,
       c.address AS customer_address
     FROM invoices i
     LEFT JOIN customers c
       ON i.customer_id = c.customer_id
     WHERE i.invoice_id = ?
       ${ownerCondition}
     LIMIT 1`,
    params
  );

  if (rows.length === 0) {
    return null;
  }

  await addInvoiceItems(rows);
  return rows[0];
}

// Load an accessible quotation and its items for invoice conversion.
async function getQuotationInvoiceData(connection, quotationId, ownerId) {
  const ownerCondition =
    ownerId === undefined || ownerId === null
      ? ""
      : "AND created_by = ?";
  const params =
    ownerId === undefined || ownerId === null
      ? [quotationId]
      : [quotationId, ownerId];
  const [quotations] = await connection.execute(
    `SELECT
       quotation_id,
       customer_id,
       currency,
       subtotal,
       discount_amount,
       tax_amount,
       total_amount,
       notes,
       terms_and_conditions
     FROM quotations
     WHERE quotation_id = ? ${ownerCondition}
     LIMIT 1`,
    params
  );

  if (quotations.length === 0) {
    const error = new Error("Selected quotation was not found or is not accessible.");
    error.code = "QUOTATION_NOT_FOUND";
    throw error;
  }

  const quotation = quotations[0];
  const [items] = await connection.execute(
    `SELECT
       item_name,
       description,
       Price AS unit_price,
       tax_rate,
       line_total
     FROM quotation_items
     WHERE quotation_id = ?
     ORDER BY quotation_item_id ASC`,
    [quotationId]
  );

  if (items.length === 0) {
    const error = new Error("Selected quotation has no items.");
    error.code = "QUOTATION_HAS_NO_ITEMS";
    throw error;
  }

  return { quotation, items };
}

// Create the invoice and its items atomically, copying quotation details when selected.
async function createInvoice(
  invoice,
  items = [],
  quotationOwnerId,
  { returnDetails = false } = {}
) {
  const connection = await db.getConnection();
  let invoiceNumberLock;

  try {
    await connection.beginTransaction();

    let invoiceData = invoice;
    let invoiceItems = items;

    // A linked quotation supplies the customer and, when omitted, the invoice items.
    if (invoice.quotation_id) {
      const { quotation, items: quotationItems } =
        await getQuotationInvoiceData(
          connection,
          invoice.quotation_id,
          quotationOwnerId
        );

      if (
        invoice.customer_id &&
        Number(invoice.customer_id) !== Number(quotation.customer_id)
      ) {
        const error = new Error(
          "Selected customer does not match the selected quotation."
        );
        error.code = "QUOTATION_CUSTOMER_MISMATCH";
        throw error;
      }

      invoiceData = {
        ...invoice,
        customer_id: quotation.customer_id,
        currency: invoice.currency || quotation.currency,
        ...(invoiceItems.length === 0
          ? {
              discount_type: "fixed",
              discount_value: quotation.discount_amount,
              amount_paid: 0,
              notes: invoice.notes ?? quotation.notes,
              terms_and_conditions:
                invoice.terms_and_conditions ?? quotation.terms_and_conditions,
            }
          : {}),
      };

      if (invoiceItems.length === 0) {
        invoiceItems = quotationItems;
      }
    }

    const calculated = calculateInvoiceAmounts(invoiceData, invoiceItems);
    invoiceData = calculated.invoice;
    invoiceItems = calculated.items;

    // Generate the invoice number only when the caller did not provide one.
    if (!invoiceData.invoice_number) {
      const generated = await generateInvoiceNumber(
        connection,
        invoiceData.invoice_date
      );
      invoiceNumberLock = generated.lockName;
      invoiceData.invoice_number = generated.invoiceNumber;
    }

    const customerId = await resolveCustomerId(connection, invoiceData);

    const { fields, values } = getInvoiceValues({
      ...invoiceData,
      customer_id: customerId,
      currency: invoiceData.currency || "LKR",
      status: invoiceData.status || "Draft",
    });
    fields.push("created_by");
    values.push(invoiceData.created_by ?? null);

    const placeholders = fields.map(() => "?").join(", ");
    const [result] = await connection.execute(
      `INSERT INTO invoices (${fields.join(", ")})
       VALUES (${placeholders})`,
      values
    );
    const invoiceId = result.insertId;

    for (const item of invoiceItems) {
      await connection.execute(
        `INSERT INTO invoice_items (
           invoice_id,
           item_name,
           description,
           price,
           tax_rate,
           line_total
         ) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          invoiceId,
          item.item_name.trim(),
          item.description?.trim() || null,
          item.unit_price,
          item.tax_rate,
          item.line_total,
        ]
      );
    }

    // Commit the invoice and all line items together.
    await connection.commit();
    return returnDetails
      ? {
          invoiceId,
          invoiceNumber: invoiceData.invoice_number,
        }
      : invoiceId;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    // Release the sequence lock regardless of transaction outcome.
    if (invoiceNumberLock) {
      try {
        await connection.execute("SELECT RELEASE_LOCK(?)", [
          invoiceNumberLock,
        ]);
      } catch (error) {
        console.error("Could not release invoice number lock:", error);
      }
    }
    connection.release();
  }
}

// Recalculate and replace an invoice and its items in one transaction.
async function updateInvoice(invoiceId, invoice, items, createdBy) {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const ownerCondition =
      createdBy === undefined || createdBy === null
        ? ""
        : "AND created_by = ?";
    const ownerParams =
      createdBy === undefined || createdBy === null ? [] : [createdBy];
    const [existing] = await connection.execute(
      `SELECT invoice_id
       FROM invoices
       WHERE invoice_id = ? ${ownerCondition}
       FOR UPDATE`,
      [invoiceId, ...ownerParams]
    );

    if (existing.length === 0) {
      await connection.rollback();
      return false;
    }

    const customerId = await resolveCustomerId(connection, invoice);
    const calculated = calculateInvoiceAmounts(
      { ...invoice, customer_id: customerId },
      items
    );
    const { fields, values } = getInvoiceValues({
      ...calculated.invoice,
    });
    if (fields.length > 0) {
      const assignments = fields.map((field) => `${field} = ?`).join(", ");
      await connection.execute(
        `UPDATE invoices
         SET ${assignments}
         WHERE invoice_id = ? ${ownerCondition}`,
        [...values, invoiceId, ...ownerParams]
      );
    }

    await connection.execute(
      "DELETE FROM invoice_items WHERE invoice_id = ?",
      [invoiceId]
    );

    for (const item of calculated.items) {
      await connection.execute(
        `INSERT INTO invoice_items (
           invoice_id,
           item_name,
           description,
           price,
           tax_rate,
           line_total
         ) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          invoiceId,
          item.item_name.trim(),
          item.description?.trim() || null,
          item.unit_price,
          item.tax_rate,
          item.line_total,
        ]
      );
    }

    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

// Delete an invoice and its items only while its status is Draft.
async function deleteInvoice(invoiceId, createdBy) {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const ownerCondition =
      createdBy === undefined || createdBy === null
        ? ""
        : "AND created_by = ?";
    const ownerParams =
      createdBy === undefined || createdBy === null ? [] : [createdBy];
    const [invoices] = await connection.execute(
      `SELECT invoice_id
       FROM invoices
       WHERE invoice_id = ?
         AND status = 'Draft'
         ${ownerCondition}
       FOR UPDATE`,
      [invoiceId, ...ownerParams]
    );

    if (invoices.length === 0) {
      await connection.rollback();
      return false;
    }

    await connection.execute(
      "DELETE FROM invoice_items WHERE invoice_id = ?",
      [invoiceId]
    );
    await connection.execute(
      `DELETE FROM invoices
       WHERE invoice_id = ?
         AND status = 'Draft'
         ${ownerCondition}`,
      [invoiceId, ...ownerParams]
    );

    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

// Record a payment and update the invoice balance and paid status atomically.
async function recordInvoicePayment(
  invoiceId,
  payment,
  ownerId,
  receivedBy
) {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const ownerCondition =
      ownerId === undefined || ownerId === null
        ? ""
        : "AND created_by = ?";
    const ownerParams =
      ownerId === undefined || ownerId === null ? [] : [ownerId];
    const [invoices] = await connection.execute(
      `SELECT invoice_id, total_amount, amount_paid, balance_due, status
       FROM invoices
       WHERE invoice_id = ? ${ownerCondition}
       FOR UPDATE`,
      [invoiceId, ...ownerParams]
    );

    if (invoices.length === 0) {
      await connection.rollback();
      return null;
    }

    const invoice = invoices[0];
    const amount = roundMoney(Number(payment.amount));
    const balanceDue = roundMoney(Number(invoice.balance_due));

    if (invoice.status === "Cancelled") {
      const error = new Error("Payments cannot be recorded for a cancelled invoice.");
      error.code = "INVOICE_CANCELLED";
      throw error;
    }

    if (amount > balanceDue) {
      const error = new Error("Payment cannot exceed the invoice balance due.");
      error.code = "PAYMENT_EXCEEDS_BALANCE";
      throw error;
    }

    const amountPaid = roundMoney(Number(invoice.amount_paid) + amount);
    const newBalance = roundMoney(Number(invoice.total_amount) - amountPaid);

    // Preserve each payment as a separate record in the payment history.
    const [result] = await connection.execute(
      `INSERT INTO payments (
         invoice_id,
         received_by,
         payment_date,
         amount,
         payment_method,
         reference_number,
         notes
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        invoiceId,
        receivedBy ?? null,
        payment.payment_date,
        amount,
        payment.payment_method || "Other",
        payment.reference_number?.trim() || null,
        payment.notes?.trim() || null,
      ]
    );

    // Mark the invoice Paid only after its remaining balance reaches zero.
    await connection.execute(
      `UPDATE invoices
       SET amount_paid = ?,
           balance_due = ?,
           status = CASE WHEN ? = 0 THEN 'Paid' ELSE status END
       WHERE invoice_id = ? ${ownerCondition}`,
      [amountPaid, newBalance, newBalance, invoiceId, ...ownerParams]
    );

    await connection.commit();
    return {
      payment_id: result.insertId,
      invoice_id: invoiceId,
      amount_paid: amountPaid,
      balance_due: newBalance,
      status: newBalance === 0 ? "Paid" : invoice.status,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  getAllInvoices,
  getInvoiceById,
  createInvoice,
  updateInvoice,
  deleteInvoice,
  recordInvoicePayment,
};