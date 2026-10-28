
const db = require("../config/db");
const { createCustomer } = require("./customerModel");

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
    period,
    status,
    approval_status,
    search,
    from_date,
    to_date,
  } = filters;

  if (period && period !== "all") {
    const periodMap = {
      "1w": "7 DAY",
      "1m": "1 MONTH",
      "1y": "1 YEAR",
      "2y": "2 YEAR",
    };

    if (!periodMap[period]) {
      throw new Error("Invalid date period.");
    }

    conditions.push(
      `q.quotation_date >= DATE_SUB(CURDATE(), INTERVAL ${periodMap[period]})`
    );
  }

  if (from_date || to_date) {
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
      "(q.quotation_number LIKE ? OR c.customer_name LIKE ?)"
    );

    const searchTerm = `%${String(search).trim()}%`;
    params.push(searchTerm, searchTerm);
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
      q.status,
      q.customer_status,
      q.approval_status,
      q.notes,
      q.terms_and_conditions,
      q.created_at,
      q.updated_at
    FROM quotations q
    INNER JOIN customers c
      ON q.customer_id = c.customer_id
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

async function getQuotationById(quotationId) {
  const [rows] = await db.execute(
    `SELECT
      q.quotation_id,
      q.quotation_number,
      q.customer_id,
      c.customer_name,
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
      q.status,
      q.customer_status,
      q.approval_status,
      q.notes,
      q.terms_and_conditions,
      q.created_at,
      q.updated_at
    FROM quotations q
    INNER JOIN customers c
      ON q.customer_id = c.customer_id
    WHERE q.quotation_id = ?
    LIMIT 1`,
    [quotationId]
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
async function createQuotationWithItems(quotation, items) {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const customerId = await createCustomer(
      {
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
      { matchByNameOnly: true }
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
          tax_rate,
          line_total
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          quotationId,
          item.item_name.trim(),
          item.description?.trim() || null,
          item.technology?.trim() || null,
          item.website_type?.trim() || null,
          item.hosting_domain?.trim() || null,
          unitPrice.toFixed(2),
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
  items
) {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [existing] = await connection.execute(
      `SELECT quotation_id
       FROM quotations
       WHERE quotation_id = ?
       FOR UPDATE`,
      [quotationId]
    );

    if (existing.length === 0) {
      await connection.rollback();
      return false;
    }

    const customerId = await createCustomer(
      {
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
      { matchByNameOnly: true }
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
          tax_rate,
          line_total
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          quotationId,
          item.item_name.trim(),
          item.description?.trim() || null,
          item.technology?.trim() || null,
          item.website_type?.trim() || null,
          item.hosting_domain?.trim() || null,
          unitPrice.toFixed(2),
          taxRate.toFixed(2),
          lineTotal.toFixed(2),
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

async function deleteQuotationById(quotationId) {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [quotations] = await connection.execute(
      `SELECT quotation_id
       FROM quotations
       WHERE quotation_id = ?
       FOR UPDATE`,
      [quotationId]
    );

    if (quotations.length === 0) {
      await connection.rollback();
      return { deleted: false, reason: "not_found" };
    }

    const [invoices] = await connection.execute(
      `SELECT invoice_id
       FROM invoices
       WHERE quotation_id = ?
       LIMIT 1`,
      [quotationId]
    );

    if (invoices.length > 0) {
      await connection.rollback();
      return { deleted: false, reason: "linked_invoice" };
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
