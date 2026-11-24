
const db = require("../config/db");
const { createCustomer } = require("./customerModel");
const { getPeriodCondition, normalizePeriod } = require("../utils/periodFilter");

// Build quotation list filters.
function buildQuotationFilters(filters = {}) {
  const conditions = [];
  const params = [];

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

  const {
    period: requestedPeriod,
    status,
    approval_status,
    search,
    from_date,
    to_date,
    created_by,
    for_invoice: forInvoice = false,
  } = filters;
  const period = normalizePeriod(requestedPeriod);
  if (!period) {
    throw new Error("Invalid period. Allowed: 1w, 1m, 3m, 1y, 2y.");
  }

  if (!forInvoice && created_by !== undefined && created_by !== null) {
    conditions.push("q.created_by = ?");
    params.push(created_by);
  }

  if (!forInvoice && !from_date && !to_date) {
    conditions.push(getPeriodCondition("q.quotation_date", period));
  }

  if (!forInvoice && (from_date || to_date)) {
    if (
      (from_date && !/^\d{4}-\d{2}-\d{2}$/.test(from_date)) ||
      (to_date && !/^\d{4}-\d{2}-\d{2}$/.test(to_date))
    ) {
      throw new Error("Dates must use YYYY-MM-DD format.");
    }

    if (from_date && to_date && from_date > to_date) {
      throw new Error("From date cannot be after to date.");
    }

    if (from_date) {
      conditions.push("q.quotation_date >= ?");
      params.push(from_date);
    }

    if (to_date) {
      conditions.push("q.quotation_date <= ?");
      params.push(to_date);
    }
  }

  if (forInvoice) {
    conditions.push("q.approval_status = 'Approved'");
  }

  if (status) {
    if (!allowedStatuses.includes(status)) {
      throw new Error("Invalid quotation status.");
    }

    conditions.push("q.status = ?");
    params.push(status);
  }

  if (approval_status) {
    if (!allowedApprovalStatuses.includes(approval_status)) {
      throw new Error("Invalid approval status.");
    }

    conditions.push("q.approval_status = ?");
    params.push(approval_status);
  }

  if (search && String(search).trim()) {
    conditions.push(
      "(q.quotation_number LIKE ? OR c.customer_name LIKE ? OR c.phone LIKE ?)"
    );

    const searchTerm = `%${String(search).trim()}%`;
    params.push(searchTerm, searchTerm, searchTerm);
  }

  return {
    where: conditions.length
      ? `WHERE ${conditions.join(" AND ")}`
      : "",
    params,
  };
}

async function getAllQuotations(filters = {}) {
  const { where, params } = buildQuotationFilters(filters);

  const [rows] = await db.execute(
    `
    SELECT
      q.quotation_id,
      q.quotation_number,
      q.customer_id,
      c.customer_name,
      c.company_name AS company_name,
      c.company_name AS customer_company,
      c.email AS email,
      c.email AS customer_email,
      c.phone AS phone,
      c.phone AS customer_phone,
      c.address AS address,
      c.address AS customer_address,
      q.created_by,
      q.quotation_date,
      q.project_start_date,
      q.estimated_duration,
      q.duration_unit,
      q.estimated_completion_date,
      q.valid_until,
      q.currency,
      q.subtotal,
      q.discount_amount,
      q.tax_amount,
      q.total_amount,
      COALESCE(payment_totals.verified_amount, 0) AS amount_paid,
      COALESCE(payment_totals.verified_amount, 0)
        + COALESCE(payment_totals.pending_amount, 0) AS advance_payment_amount,
      GREATEST(
        q.total_amount
          - COALESCE(payment_totals.verified_amount, 0)
          - COALESCE(payment_totals.pending_amount, 0),
        0
      ) AS remaining_amount,
      GREATEST(
        q.total_amount
          - COALESCE(payment_totals.verified_amount, 0)
          - COALESCE(payment_totals.pending_amount, 0),
        0
      ) AS balance_due,
      GREATEST(
        q.total_amount - COALESCE(payment_totals.verified_amount, 0),
        0
      ) AS verified_remaining_amount,
      COALESCE(payment_totals.pending_amount, 0) AS pending_payment_amount,
      GREATEST(
        q.total_amount
          - COALESCE(payment_totals.verified_amount, 0)
          - COALESCE(payment_totals.pending_amount, 0),
        0
      ) AS available_payment_amount,
      q.status,
      q.customer_status,
      q.approval_status,
      q.rejection_reason,
      q.notes,
      q.terms_and_conditions,
      q.created_at,
      q.updated_at
    FROM quotations q
    INNER JOIN customers c
      ON q.customer_id = c.customer_id
    LEFT JOIN (
      SELECT
        quotation_id,
        SUM(CASE WHEN payment_status = 'Verified' THEN amount ELSE 0 END)
          AS verified_amount,
        SUM(CASE WHEN payment_status = 'Pending' THEN amount ELSE 0 END)
          AS pending_amount
      FROM payments
      GROUP BY quotation_id
    ) payment_totals
      ON payment_totals.quotation_id = q.quotation_id
    ${where}
    ORDER BY q.quotation_id DESC
    `,
    params
  );

  for (const quotation of rows) {
    const [items] = await db.execute(
      `SELECT
        quotation_item_id,
        quotation_id,
        item_name,
        description,
        technology,
        website_type,
        hosting_domain,
        Price AS unit_price,
        price_text,
        price_text AS unit_price_text,
        tax_rate,
        line_total,
        created_at
      FROM quotation_items
      WHERE quotation_id = ?
      ORDER BY quotation_item_id ASC`,
      [quotation.quotation_id]
    );

    quotation.items = items;
  }

  return rows;
}

async function getQuotationById(quotationId, createdBy) {
  const ownerCondition =
    createdBy === undefined || createdBy === null
      ? ""
      : "AND q.created_by = ?";
  const params =
    createdBy === undefined || createdBy === null
      ? [quotationId]
      : [quotationId, createdBy];

  const [rows] = await db.execute(
    `SELECT
      q.quotation_id,
      q.quotation_number,
      q.customer_id,
      c.customer_name,
      c.company_name AS company_name,
      c.company_name AS customer_company,
      c.email AS email,
      c.email AS customer_email,
      c.phone AS phone,
      c.phone AS customer_phone,
      c.address AS address,
      c.address AS customer_address,
      q.created_by,
      q.quotation_date,
      q.project_start_date,
      q.estimated_duration,
      q.duration_unit,
      q.estimated_completion_date,
      q.valid_until,
      q.currency,
      q.subtotal,
      q.discount_amount,
      q.tax_amount,
      q.total_amount,
      COALESCE(payment_totals.verified_amount, 0) AS amount_paid,
      COALESCE(payment_totals.verified_amount, 0)
        + COALESCE(payment_totals.pending_amount, 0) AS advance_payment_amount,
      GREATEST(
        q.total_amount
          - COALESCE(payment_totals.verified_amount, 0)
          - COALESCE(payment_totals.pending_amount, 0),
        0
      ) AS remaining_amount,
      GREATEST(
        q.total_amount
          - COALESCE(payment_totals.verified_amount, 0)
          - COALESCE(payment_totals.pending_amount, 0),
        0
      ) AS balance_due,
      GREATEST(
        q.total_amount - COALESCE(payment_totals.verified_amount, 0),
        0
      ) AS verified_remaining_amount,
      COALESCE(payment_totals.pending_amount, 0) AS pending_payment_amount,
      GREATEST(
        q.total_amount
          - COALESCE(payment_totals.verified_amount, 0)
          - COALESCE(payment_totals.pending_amount, 0),
        0
      ) AS available_payment_amount,
      q.status,
      q.customer_status,
      q.approval_status,
      q.rejection_reason,
      q.notes,
      q.terms_and_conditions,
      q.created_at,
      q.updated_at
    FROM quotations q
    INNER JOIN customers c
      ON q.customer_id = c.customer_id
    LEFT JOIN (
      SELECT
        quotation_id,
        SUM(CASE WHEN payment_status = 'Verified' THEN amount ELSE 0 END)
          AS verified_amount,
        SUM(CASE WHEN payment_status = 'Pending' THEN amount ELSE 0 END)
          AS pending_amount
      FROM payments
      GROUP BY quotation_id
    ) payment_totals
      ON payment_totals.quotation_id = q.quotation_id
    WHERE q.quotation_id = ?
      ${ownerCondition}
    LIMIT 1`,
    params
  );

  if (rows.length === 0) {
    return null;
  }

  const quotation = rows[0];

  const [items] = await db.execute(
    `SELECT
      quotation_item_id,
      quotation_id,
      item_name,
      description,
      technology,
      website_type,
      hosting_domain,
      Price AS unit_price,
      price_text,
      price_text AS unit_price_text,
      tax_rate,
      line_total,
      created_at
    FROM quotation_items
    WHERE quotation_id = ?
    ORDER BY quotation_item_id ASC`,
    [quotationId]
  );

  quotation.items = items;

  return quotation;
}

// Create quotation, customer (if needed), and quotation items atomically.
async function createQuotationWithItems(
  quotation,
  items,
  { advancePaymentStatus = "Pending" } = {}
) {
  const advancePaymentAmount = Number(
    quotation.advance_payment_amount ?? 0
  );
  if (
    !Number.isFinite(advancePaymentAmount) ||
    advancePaymentAmount < 0 ||
    advancePaymentAmount > Number(quotation.total_amount) ||
    Math.abs(advancePaymentAmount * 100 - Math.round(advancePaymentAmount * 100)) >
      0.000001
  ) {
    const error = new Error("Invalid advance payment amount.");
    error.code = "INVALID_ADVANCE_PAYMENT";
    throw error;
  }
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const customerId = await createCustomer(
      {
        customer_id: quotation.customer_id,
        customer_name: quotation.customer_name,
        company_name: quotation.company_name,
        email: quotation.email,
        phone: quotation.phone,
        address: quotation.address,
        city: quotation.city,
        country: quotation.country,
        tax_number: quotation.tax_number,
        notes: quotation.customer_notes,
        created_by: quotation.created_by,
      },
      connection,
      {
        requirePhone: true,
        forceNewCustomer:
          Boolean(quotation.copy_from_quotation_id) ||
          Boolean(quotation.duplicate_from_quotation_id),
      }
    );

    const [result] = await connection.execute(
      `INSERT INTO quotations (
        quotation_number,
        customer_id,
        created_by,
        quotation_date,
        project_start_date,
        estimated_duration,
        duration_unit,
        estimated_completion_date,
        valid_until,
        currency,
        subtotal,
        discount_amount,
        tax_amount,
        total_amount,
        status,
        approval_status,
        notes,
        terms_and_conditions
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        quotation.quotation_number,
        customerId,
        quotation.created_by,
        quotation.quotation_date,
        quotation.project_start_date || quotation.quotation_date,
        quotation.estimated_duration ?? null,
        quotation.duration_unit || null,
        quotation.estimated_completion_date || null,
        quotation.valid_until || null,
        quotation.currency || "LKR",
        quotation.subtotal,
        quotation.discount_amount,
        quotation.tax_amount,
        quotation.total_amount,
        quotation.status || "Draft",
        quotation.approval_status || "Not Required",
        quotation.notes || null,
        quotation.terms_and_conditions || null,
      ]
    );

    const quotationId = result.insertId;
    if (advancePaymentAmount > 0) {
      if (!["Pending", "Verified"].includes(advancePaymentStatus)) {
        throw new Error("Invalid advance payment status.");
      }

      await connection.execute(
        `INSERT INTO payments (
           invoice_id,
           quotation_id,
           received_by,
           payment_date,
           amount,
           payment_method,
           notes,
           payment_type,
           payment_status,
           verified_by,
           verified_at
         ) VALUES (NULL, ?, ?, ?, ?, 'Other', 'Advance payment entered with quotation', ?, ?, ?, CASE WHEN ? = 'Verified' THEN NOW() ELSE NULL END)`,
        [
          quotationId,
          quotation.created_by,
          quotation.quotation_date,
          advancePaymentAmount,
          advancePaymentAmount >= Number(quotation.total_amount)
            ? "Full Payment"
            : "Advance",
          advancePaymentStatus,
          advancePaymentStatus === "Verified" ? quotation.created_by : null,
          advancePaymentStatus,
        ]
      );
    }

    for (const item of items) {
      const unitPrice = Number(item.unit_price);
      const taxRate = Number(item.tax_rate ?? 0);
      const lineTotal = Number(
        (unitPrice + (unitPrice * taxRate) / 100).toFixed(2)
      );

      await connection.execute(
        `INSERT INTO quotation_items (
          quotation_id,
          item_name,
          description,
          technology,
          website_type,
          hosting_domain,
          Price,
          price_text,
          tax_rate,
          line_total
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          quotationId,
          item.item_name.trim(),
          item.description?.trim() || null,
          item.technology?.trim() || null,
          item.website_type?.trim() || null,
          item.hosting_domain?.trim() || null,
          unitPrice.toFixed(2),
          item.price_text?.trim() || null,
          taxRate.toFixed(2),
          lineTotal.toFixed(2),
        ]
      );
    }

    await connection.commit();

    return quotationId;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

// Update quotation and its items.
async function updateQuotationWithItems(
  quotationId,
  quotation,
  items,
  createdBy,
  { advancePaymentStatus = "Pending" } = {}
) {
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
      `SELECT quotation_id
       FROM quotations
       WHERE quotation_id = ? ${ownerCondition}
       FOR UPDATE`,
      [quotationId, ...ownerParams]
    );

    if (existing.length === 0) {
      await connection.rollback();
      return false;
    }

    const customerId = await createCustomer(
      {
        customer_id: quotation.customer_id,
        customer_name: quotation.customer_name,
        company_name: quotation.company_name,
        email: quotation.email,
        phone: quotation.phone,
        address: quotation.address,
        city: quotation.city,
        country: quotation.country,
        tax_number: quotation.tax_number,
        notes: quotation.customer_notes,
        created_by: quotation.created_by,
      },
      connection,
      { requirePhone: true }
    );

    await connection.execute(
      `UPDATE quotations
       SET quotation_number = ?,
           customer_id = ?,
           quotation_date = ?,
           project_start_date = ?,
           estimated_duration = ?,
           duration_unit = ?,
           estimated_completion_date = ?,
           valid_until = ?,
           currency = ?,
           subtotal = ?,
           discount_amount = ?,
           tax_amount = ?,
           total_amount = ?,
           status = ?,
           approval_status = ?,
           notes = ?,
           terms_and_conditions = ?
       WHERE quotation_id = ?`,
      [
        quotation.quotation_number,
        customerId,
        quotation.quotation_date,
        quotation.project_start_date || quotation.quotation_date,
        quotation.estimated_duration ?? null,
        quotation.duration_unit || null,
        quotation.estimated_completion_date || null,
        quotation.valid_until || null,
        quotation.currency || "LKR",
        quotation.subtotal,
        quotation.discount_amount,
        quotation.tax_amount,
        quotation.total_amount,
        quotation.status || "Draft",
        quotation.approval_status || "Not Required",
        quotation.notes || null,
        quotation.terms_and_conditions || null,
        quotationId,
      ]
    );

    if (quotation.advance_payment_supplied) {
      const advancePaymentAmount = Number(
        quotation.advance_payment_amount ?? 0
      );
      if (
        !Number.isFinite(advancePaymentAmount) ||
        advancePaymentAmount < 0 ||
        advancePaymentAmount > Number(quotation.total_amount)
      ) {
        throw new Error("Invalid advance payment amount.");
      }

      const [advancePayments] = await connection.execute(
        `SELECT payment_id, payment_status
         FROM payments
         WHERE quotation_id = ?
           AND invoice_id IS NULL
           AND payment_type IN ('Advance', 'Full Payment')
         ORDER BY payment_id ASC
         LIMIT 1
         FOR UPDATE`,
        [quotationId]
      );

      if (advancePaymentAmount === 0) {
        await connection.execute(
          `DELETE FROM payments
           WHERE quotation_id = ?
             AND invoice_id IS NULL
             AND payment_type IN ('Advance', 'Full Payment')`,
          [quotationId]
        );
      } else if (advancePayments.length > 0) {
        await connection.execute(
          `UPDATE payments
           SET amount = ?,
               payment_type = ?,
               payment_status = ?,
               verified_by = CASE WHEN ? = 'Verified' THEN COALESCE(verified_by, ?) ELSE NULL END,
               verified_at = CASE WHEN ? = 'Verified' THEN COALESCE(verified_at, NOW()) ELSE NULL END
           WHERE payment_id = ?`,
          [
            advancePaymentAmount,
            advancePaymentAmount >= Number(quotation.total_amount)
              ? "Full Payment"
              : "Advance",
            advancePayments[0].payment_status,
            advancePayments[0].payment_status,
            quotation.created_by,
            advancePayments[0].payment_status,
            advancePayments[0].payment_id,
          ]
        );
      } else {
        await connection.execute(
          `INSERT INTO payments (
             invoice_id,
             quotation_id,
             received_by,
             payment_date,
             amount,
             payment_method,
             notes,
             payment_type,
             payment_status,
             verified_by,
             verified_at
           ) VALUES (
             NULL, ?, ?, ?, ?, 'Other',
             'Advance payment entered while editing quotation',
             ?, ?, ?, CASE WHEN ? = 'Verified' THEN NOW() ELSE NULL END
           )`,
          [
            quotationId,
            quotation.created_by,
            quotation.quotation_date,
            advancePaymentAmount,
            advancePaymentAmount >= Number(quotation.total_amount)
              ? "Full Payment"
              : "Advance",
            advancePaymentStatus,
            advancePaymentStatus === "Verified" ? quotation.created_by : null,
            advancePaymentStatus,
          ]
        );
      }
    }

    await connection.execute(
      `DELETE FROM quotation_items
       WHERE quotation_id = ?`,
      [quotationId]
    );

    for (const item of items) {
      const unitPrice = Number(item.unit_price);
      const taxRate = Number(item.tax_rate ?? 0);
      const lineTotal = Number(
        (unitPrice + (unitPrice * taxRate) / 100).toFixed(2)
      );

      await connection.execute(
        `INSERT INTO quotation_items (
          quotation_id,
          item_name,
          description,
          technology,
          website_type,
          hosting_domain,
          Price,
          price_text,
          tax_rate,
          line_total
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          quotationId,
          item.item_name.trim(),
          item.description?.trim() || null,
          item.technology?.trim() || null,
          item.website_type?.trim() || null,
          item.hosting_domain?.trim() || null,
          unitPrice.toFixed(2),
          item.price_text?.trim() || null,
          taxRate.toFixed(2),
          lineTotal.toFixed(2),
        ]
      );
    }

    await connection.commit();

    return getQuotationById(quotationId, createdBy);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function deleteQuotationById(
  quotationId,
  createdBy,
  { cascadeLinkedInvoices = false } = {}
) {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const ownerCondition =
      createdBy === undefined || createdBy === null
        ? ""
        : "AND created_by = ?";
    const ownerParams =
      createdBy === undefined || createdBy === null ? [] : [createdBy];
    const [quotations] = await connection.execute(
      `SELECT quotation_id
       FROM quotations
       WHERE quotation_id = ? ${ownerCondition}
       FOR UPDATE`,
      [quotationId, ...ownerParams]
    );

    if (quotations.length === 0) {
      await connection.rollback();
      return { deleted: false, reason: "not_found" };
    }

    const [invoices] = await connection.execute(
      `SELECT invoice_id
       FROM invoices
       WHERE quotation_id = ?
       FOR UPDATE`,
      [quotationId]
    );

    if (invoices.length > 0 && !cascadeLinkedInvoices) {
      await connection.rollback();
      return { deleted: false, reason: "linked_invoice" };
    }

    if (cascadeLinkedInvoices) {
      await connection.execute(
        "DELETE FROM payments WHERE quotation_id = ?",
        [quotationId]
      );

      if (invoices.length > 0) {
        const invoiceIds = invoices.map((invoice) => invoice.invoice_id);
        const placeholders = invoiceIds.map(() => "?").join(", ");
        await connection.execute(
          `DELETE FROM payments WHERE invoice_id IN (${placeholders})`,
          invoiceIds
        );
        await connection.execute(
          `DELETE FROM invoice_items WHERE invoice_id IN (${placeholders})`,
          invoiceIds
        );
        await connection.execute(
          "DELETE FROM invoices WHERE quotation_id = ?",
          [quotationId]
        );
      }
    }

    await connection.execute(
      `DELETE FROM quotation_items
       WHERE quotation_id = ?`,
      [quotationId]
    );

    await connection.execute(
      `DELETE FROM quotations
       WHERE quotation_id = ?`,
      [quotationId]
    );

    await connection.commit();

    return { deleted: true };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  getAllQuotations,
  getQuotationById,
  createQuotationWithItems,
  updateQuotationWithItems,
  deleteQuotationById,
};
