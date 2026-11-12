
const db = require("../config/db");
const { getPeriodCondition, normalizePeriod } = require("../utils/periodFilter");

// --------------------------------------------------
// Get all customers
// --------------------------------------------------

async function getAllCustomers({ search = "", period: requestedPeriod } = {}) {
  const conditions = [];
  const params = [];
  const period = normalizePeriod(requestedPeriod);

  if (!period) {
    throw new Error("Invalid period. Allowed: 1w, 1m, 3m, 1y, 2y.");
  }

  if (search) {
    conditions.push(
      "(customer_name LIKE ? OR CAST(customer_id AS CHAR) LIKE ?)"
    );
    params.push(`%${search}%`, `%${search}%`);
  }

  conditions.push(getPeriodCondition("created_at", period));

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

async function searchCustomers(search, limit = 10) {
  const searchTerm = `%${search}%`;
  const prefixTerm = `${search}%`;
  const [rows] = await db.execute(
    `SELECT
       customer_id,
       customer_name,
       company_name,
       email,
       phone,
       address,
       city,
       country
     FROM customers
     WHERE customer_name LIKE ?
        OR company_name LIKE ?
     ORDER BY
       CASE
         WHEN LOWER(customer_name) = LOWER(?) THEN 0
         WHEN LOWER(customer_name) LIKE LOWER(?) THEN 1
         ELSE 2
       END,
       customer_name ASC
     LIMIT ?`,
    [searchTerm, searchTerm, search, prefixTerm, limit]
  );

  return rows;
}

// --------------------------------------------------
// Create or reuse a customer
// --------------------------------------------------

async function createCustomer(
  customer,
  connection = db,
  { matchByNameOnly = false, rejectExisting = false } = {}
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

  // Reject duplicate manual customer submissions while keeping reuse behavior for invoices and quotations.
  if (rejectExisting) {
    const identityConditions = ["LOWER(TRIM(c.customer_name)) = LOWER(?)"];
    const identityParams = [name];

    if (normalizedEmail) {
      identityConditions.push("LOWER(TRIM(c.email)) = ?");
      identityParams.push(normalizedEmail);
    }

    if (normalizedPhone) {
      identityConditions.push("TRIM(c.phone) = ?");
      identityParams.push(normalizedPhone);
    }

    const [existingCustomers] = await connection.execute(
      `SELECT c.customer_id, u.role AS created_by_role
       FROM customers c
       LEFT JOIN users u
         ON u.user_id = c.created_by
       WHERE ${identityConditions.join(" OR ")}
       ORDER BY (u.role = 'Super Admin') DESC
       LIMIT 1`,
      identityParams
    );

    if (existingCustomers.length > 0) {
      const error = new Error("Customer already exists.");
      error.code = "CUSTOMER_ALREADY_EXISTS";
      error.createdByRole = existingCustomers[0].created_by_role;
      throw error;
    }
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
async function getCustomerOverview(requestedPeriod = "1w") {
  const period = normalizePeriod(requestedPeriod);
  if (!period) {
    throw new Error("Invalid period. Allowed: 1w, 1m, 3m, 1y, 2y.");
  }
  const customerPeriod = getPeriodCondition("created_at", period);
  const quotationPeriod = getPeriodCondition("quotation_date", period);

  const [[customerSummary]] = await db.execute(
    `SELECT
       COUNT(*) AS total_customers,
       COALESCE(SUM(DATE(created_at) = CURDATE()), 0) AS customers_added_today
     FROM customers
     WHERE ${customerPeriod}`
  );

  const [[quotationSummary]] = await db.execute(
    `SELECT COUNT(*) AS accepted_quotations
     FROM quotations
     WHERE customer_status IN ('Customer Accepted', 'Accepted')
       AND ${quotationPeriod}`
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

async function getMostQuotedCustomers(requestedPeriod = "1w") {
  const period = normalizePeriod(requestedPeriod);
  if (!period) {
    throw new Error("Invalid period. Allowed: 1w, 1m, 3m, 1y, 2y.");
  }
  const quotationPeriod = getPeriodCondition("q.quotation_date", period);

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
       AND ${quotationPeriod}
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
  searchCustomers,
  createCustomer,
  getCustomerOverview,
  getMostQuotedCustomers,
};
