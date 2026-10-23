
const db = require("../config/db");

async function getAllQuotations() {
  const [rows] = await db.execute(`
    SELECT
      q.quotation_id,
      q.quotation_number,
      q.customer_id,
      c.customer_name,
      q.created_by,
      q.quotation_date,
      q.valid_until,
      q.status,
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

  // Get items belonging to each quotation
  for (const quotation of rows) {
    const [items] = await db.execute(
      `SELECT
        quotation_item_id,
        quotation_id,
        item_name,
        description,
        quantity,
        unit_price,
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

async function createQuotation(quotation) {
  const {
    quotation_number,
    customer_id,
    created_by,
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
  } = quotation;

  const [result] = await db.execute(
    `INSERT INTO quotations (
      quotation_number,
      customer_id,
      created_by,
      quotation_date,
      valid_until,
      status,
      currency,
      subtotal,
      discount_amount,
      tax_amount,
      total_amount,
      notes,
      terms_and_conditions
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      quotation_number,
      customer_id,
      created_by,
      quotation_date,
      valid_until || null,
      status || "Draft",
      currency || "LKR",
      subtotal ?? 0,
      discount_amount ?? 0,
      tax_amount ?? 0,
      total_amount ?? 0,
      notes || null,
      terms_and_conditions || null,
    ]
  );

  return result.insertId;
}

async function addQuotationItems(quotationId, items) {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    for (const item of items) {
      const quantity = Number(item.quantity);
      const unitPrice = Number(item.unit_price);
      const taxRate = Number(item.tax_rate ?? 0);

      const lineTotal =
        quantity * unitPrice * (1 + taxRate / 100);

      await connection.execute(
        `INSERT INTO quotation_items (
          quotation_id,
          item_name,
          description,
          quantity,
          unit_price,
          tax_rate,
          line_total
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          quotationId,
          item.item_name,
          item.description || null,
          quantity,
          unitPrice,
          taxRate,
          lineTotal.toFixed(2),
        ]
      );
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  getAllQuotations,
  createQuotation,
  addQuotationItems,
};
