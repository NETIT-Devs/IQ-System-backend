
const db = require("../config/db");

// Get all invoices
async function getAllInvoices() {
  const [rows] = await db.execute(`
    SELECT
      i.*,
      c.customer_name
    FROM invoices i
    LEFT JOIN customers c
      ON i.customer_id = c.customer_id
    ORDER BY i.invoice_id DESC
  `);

  return rows;
}

module.exports = {
  getAllInvoices,
};
