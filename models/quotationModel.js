
const db = require("../config/db");

// Get all quotations with their items
async function getAllQuotations() {
  const [rows] = await db.execute(`
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
      q.notes,
      q.terms_and_conditions,
      q.created_at,
      q.updated_at
    FROM quotations q
    INNER JOIN customers c
      ON q.customer_id = c.customer_id
    ORDER BY q.quotation_id DESC
  `);

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

// Get one quotation by ID with its items
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

// Create quotation and its items
async function createQuotationWithItems(quotation, items) {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

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
        notes,
        terms_and_conditions
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        quotation.quotation_number,
        quotation.customer_id,
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

// Update quotation and its items
async function updateQuotationWithItems(quotationId, quotation, items) {
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
           notes = ?,
           terms_and_conditions = ?
       WHERE quotation_id = ?`,
      [
        quotation.quotation_number,
        quotation.customer_id,
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

// Delete quotation and its items
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

    // Prevent deletion if an invoice is linked
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
