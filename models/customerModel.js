
const db = require("../config/db");

// --------------------------------------------------
// Get all customers
// --------------------------------------------------

async function getAllCustomers() {
  const [rows] = await db.execute(
    `SELECT
       customer_id,
       customer_name,
       company_name,
       email,
       phone,
       address,
       city,
       country,
       tax_number,
       notes,
       created_by,
       created_at,
       updated_at
     FROM customers
     ORDER BY customer_id DESC`
  );

  return rows;
}

// --------------------------------------------------
// Create or reuse a customer
// --------------------------------------------------

async function createCustomer(customer, connection = db) {
  const {
    customer_name,
    company_name,
    email,
    phone,
    address,
    city,
    country,
    tax_number,
    notes,
    created_by,
  } = customer;

  const name = String(customer_name || "").trim();
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const normalizedPhone = String(phone || "").trim();

  if (!name) {
    throw new Error("Customer name is required.");
  }

  // Reuse an existing customer with the same email.
  if (normalizedEmail) {
    const [existing] = await connection.execute(
      `SELECT customer_id
       FROM customers
       WHERE LOWER(TRIM(email)) = ?
       LIMIT 1`,
      [normalizedEmail]
    );

    if (existing.length > 0) {
      return existing[0].customer_id;
    }
  }

  // If there is no email, check phone number.
  if (!normalizedEmail && normalizedPhone) {
    const [existing] = await connection.execute(
      `SELECT customer_id
       FROM customers
       WHERE TRIM(phone) = ?
       LIMIT 1`,
      [normalizedPhone]
    );

    if (existing.length > 0) {
      return existing[0].customer_id;
    }
  }

  const [result] = await connection.execute(
    `INSERT INTO customers
      (
        customer_name,
        company_name,
        email,
        phone,
        address,
        city,
        country,
        tax_number,
        notes,
        created_by
      )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      name,
      company_name?.trim() || null,
      normalizedEmail || null,
      normalizedPhone || null,
      address?.trim() || null,
      city?.trim() || null,
      country?.trim() || null,
      tax_number?.trim() || null,
      notes?.trim() || null,
      created_by || null,
    ]
  );

  return result.insertId;
}

// --------------------------------------------------
// Get most quoted customers
// --------------------------------------------------

async function getMostQuotedCustomers() {
  const [rows] = await db.execute(
    `SELECT
       c.customer_id,
       c.customer_name,
       c.company_name,
       c.email,
       c.phone,
       COUNT(q.quotation_id) AS quotation_count,
       COALESCE(SUM(q.total_amount), 0) AS total_quotation_value
     FROM customers c
     INNER JOIN quotations q
       ON q.customer_id = c.customer_id
     WHERE q.status <> 'Cancelled'
     GROUP BY
       c.customer_id,
       c.customer_name,
       c.company_name,
       c.email,
       c.phone
     ORDER BY
       quotation_count DESC,
       total_quotation_value DESC`
  );

  return rows;
}

module.exports = {
  getAllCustomers,
  createCustomer,
  getMostQuotedCustomers,
};
