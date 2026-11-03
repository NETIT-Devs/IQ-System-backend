const db = require("../config/db");

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
       c.customer_name
     FROM invoices i
     LEFT JOIN customers c
       ON i.customer_id = c.customer_id
     ${ownerCondition}
     ORDER BY i.invoice_id DESC`,
    params
  );

  return rows;
}

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
       c.customer_name
     FROM invoices i
     LEFT JOIN customers c
       ON i.customer_id = c.customer_id
     WHERE i.invoice_id = ?
       ${ownerCondition}
     LIMIT 1`,
    params
  );

  return rows[0] || null;
}

module.exports = {
  getAllInvoices,
  getInvoiceById,
};