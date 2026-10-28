
const db = require("../config/db");

// --------------------------------------------------
// Get all customers
// --------------------------------------------------

async function getAllCustomers({ search = "", period = "" } = {}) {
  const conditions = [];
  const params = [];

  if (search) {
    conditions.push("customer_name LIKE ?");
    params.push(`%${search}%`);
  }

  if (period === "today") {
    conditions.push("DATE(created_at) = CURDATE()");
  } else if (period === "last7days") {
    conditions.push("created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)");
  } else if (period === "thismonth") {
    conditions.push(
      "created_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01') AND created_at < DATE_ADD(LAST_DAY(CURDATE()), INTERVAL 1 DAY)"
    );
  }

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
     ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
     ORDER BY customer_id DESC`,
    params
  );

  return rows;
}

// --------------------------------------------------
// Create or reuse a customer
// --------------------------------------------------

async function createCustomer(
  customer,
  connection = db,
  { matchByNameOnly = false } = {}
) {
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

  // Prefer an existing customer with the same normalized name.
  const [existingByName] = await connection.execute(
    `SELECT customer_id
     FROM customers
     WHERE LOWER(TRIM(customer_name)) = LOWER(?)
     LIMIT 1`,
    [name]
  );

  if (existingByName.length > 0) {
    return existingByName[0].customer_id;
  }

  // Reuse an existing customer with the same email.
  if (!matchByNameOnly && normalizedEmail) {
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
  if (!matchByNameOnly && !normalizedEmail && normalizedPhone) {
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

// Database-calculated customer overview for the customers page.
async function getCustomerOverview() {
  const [[customerSummary]] = await db.execute(
    `SELECT
       COUNT(*) AS total_customers,
       COALESCE(SUM(DATE(created_at) = CURDATE()), 0) AS customers_added_today
     FROM customers`
  );

  const [[quotationSummary]] = await db.execute(
    `SELECT COUNT(*) AS accepted_quotations
     FROM quotations
     WHERE customer_status IN ('Customer Accepted', 'Accepted')`
  );

  return {
    total_customers: Number(customerSummary.total_customers),
    customers_added_today: Number(customerSummary.customers_added_today),
    accepted_quotations: Number(quotationSummary.accepted_quotations),
  };
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
  getCustomerOverview,
  getMostQuotedCustomers,
};
