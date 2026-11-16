
const db = require("../config/db");
const { getPeriodCondition, normalizePeriod } = require("../utils/periodFilter");

// --------------------------------------------------
// Get all customers
// --------------------------------------------------

async function getAllCustomers({
  search = "",
  period: requestedPeriod,
  createdBy,
} = {}) {
  const conditions = [];
  const params = [];
  const period = normalizePeriod(requestedPeriod);

  if (!period) {
    throw new Error("Invalid period. Allowed: 1w, 1m, 3m, 1y, 2y.");
  }

  if (search) {
    conditions.push(
      "(customers.customer_name LIKE ? OR CAST(customers.customer_id AS CHAR) LIKE ?)"
    );
    params.push(`%${search}%`, `%${search}%`);
  }

  conditions.push(getPeriodCondition("created_at", period));
  if (createdBy != null) {
    conditions.push(
      `(customers.created_by = ?
        OR EXISTS (
          SELECT 1
          FROM quotations q
          WHERE q.customer_id = customers.customer_id
            AND q.created_by = ?
        )
        OR EXISTS (
          SELECT 1
          FROM invoices i
          WHERE i.customer_id = customers.customer_id
            AND i.created_by = ?
        ))`
    );
  }

  const invoiceOwnerCondition =
    createdBy == null ? "" : "WHERE i.created_by = ?";
  const [rows] = await db.execute(
    `SELECT
       customers.customer_id,
       customers.customer_name,
       customers.company_name,
       customers.email,
       customers.phone,
       customers.address,
       customers.city,
       customers.country,
       customers.tax_number,
       customers.notes,
       customers.created_by,
       (
         SELECT COUNT(*)
         FROM quotations q
         WHERE q.customer_id = customers.customer_id
           ${createdBy == null ? "" : "AND q.created_by = ?"}
       ) AS quotation_count,
       (
         SELECT COUNT(*)
         FROM invoices i
         WHERE i.customer_id = customers.customer_id
           ${createdBy == null ? "" : "AND i.created_by = ?"}
       ) AS invoice_count,
       COALESCE(invoice_summary.draft_invoice_count, 0) AS draft_invoice_count,
       COALESCE(invoice_summary.issued_invoice_count, 0) AS issued_invoice_count,
       COALESCE(invoice_summary.overdue_invoice_count, 0) AS overdue_invoice_count,
       COALESCE(invoice_summary.cancelled_invoice_count, 0) AS cancelled_invoice_count,
       COALESCE(invoice_summary.paid_invoice_count, 0) AS paid_invoice_count,
       COALESCE(invoice_summary.invoice_total_amount, 0) AS invoice_total_amount,
       COALESCE(invoice_summary.invoice_amount_paid, 0) AS invoice_amount_paid,
       COALESCE(invoice_summary.invoice_balance_due, 0) AS invoice_balance_due,
       customers.created_at,
       customers.updated_at
     FROM customers
     LEFT JOIN (
       SELECT
         i.customer_id,
         SUM(i.status = 'Draft') AS draft_invoice_count,
         SUM(i.status = 'Issued') AS issued_invoice_count,
         SUM(i.status = 'Overdue') AS overdue_invoice_count,
         SUM(i.status = 'Cancelled') AS cancelled_invoice_count,
         SUM(i.status = 'Paid') AS paid_invoice_count,
         COALESCE(SUM(i.total_amount), 0) AS invoice_total_amount,
         COALESCE(SUM(i.amount_paid), 0) AS invoice_amount_paid,
         COALESCE(SUM(i.balance_due), 0) AS invoice_balance_due
       FROM invoices i
       ${invoiceOwnerCondition}
       GROUP BY i.customer_id
     ) invoice_summary
       ON invoice_summary.customer_id = customers.customer_id
     ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
     ORDER BY customers.customer_id DESC`,
    createdBy == null
      ? params
      : [
          createdBy,
          createdBy,
          createdBy,
          ...params,
          createdBy,
          createdBy,
          createdBy,
        ]
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
  {
    matchByNameOnly = false,
    rejectExisting = false,
    claimSuperAdminCustomer = false,
  } = {}
) {
  const {
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
  } = customer;

  const name = String(customer_name || "").trim();
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const normalizedPhone = String(phone || "").trim();

  if (customer_id !== undefined && customer_id !== null) {
    const normalizedCustomerId = Number(customer_id);
    if (!Number.isInteger(normalizedCustomerId) || normalizedCustomerId <= 0) {
      throw new Error("Customer ID must be a valid positive integer.");
    }

    const [existingCustomers] = await connection.execute(
      `SELECT customer_id, email
       FROM customers
       WHERE customer_id = ?
       LIMIT 1`,
      [normalizedCustomerId]
    );
    if (existingCustomers.length === 0) {
      throw new Error("Selected customer was not found.");
    }

    if (normalizedEmail) {
      await connection.execute(
        `UPDATE customers
         SET email = ?
         WHERE customer_id = ?`,
        [normalizedEmail, normalizedCustomerId]
      );
    } else if (!String(existingCustomers[0].email || "").trim()) {
      throw new Error("Customer email is required.");
    }
    return normalizedCustomerId;
  }

  if (!name) {
    throw new Error("Customer name is required.");
  }

  // Reuse a Super Admin customer row when an Admin manually adds that same customer.
  if (rejectExisting) {
    const identityCondition = normalizedEmail
      ? "(LOWER(TRIM(COALESCE(c.email, ''))) = ? OR " +
        "(TRIM(COALESCE(c.email, '')) = '' AND LOWER(TRIM(c.customer_name)) = LOWER(?)))"
      : "LOWER(TRIM(c.customer_name)) = LOWER(?)";
    const identityParams = normalizedEmail
      ? [normalizedEmail, name]
      : [name];

    const [existingCustomers] = await connection.execute(
      `SELECT c.customer_id, c.created_by, u.role AS created_by_role
       FROM customers c
       LEFT JOIN users u
         ON u.user_id = c.created_by
       WHERE ${identityCondition}
       ORDER BY
         ${normalizedEmail ? "(LOWER(TRIM(COALESCE(c.email, ''))) = ?) DESC," : ""}
         (u.role = 'Super Admin') DESC,
         c.customer_id DESC
       LIMIT 1`,
      normalizedEmail ? [...identityParams, normalizedEmail] : identityParams
    );

    if (existingCustomers.length > 0) {
      const existingCustomer = existingCustomers[0];
      if (
        claimSuperAdminCustomer &&
        existingCustomer.created_by_role === "Super Admin"
      ) {
        const [claimResult] = await connection.execute(
          `UPDATE customers
           SET created_by = ?
           WHERE customer_id = ? AND created_by = ?`,
          [
            created_by,
            existingCustomer.customer_id,
            existingCustomer.created_by,
          ]
        );

        if (claimResult.affectedRows === 1) {
          return existingCustomer.customer_id;
        }
      }

      const error = new Error("Customer already exists.");
      error.code = "CUSTOMER_ALREADY_EXISTS";
      error.createdByRole = existingCustomer.created_by_role;
      throw error;
    }
  }

  // Prefer an existing customer with the same normalized name.
  let existingByName = [];
  if (!(rejectExisting && normalizedEmail)) {
    [existingByName] = await connection.execute(
      `SELECT customer_id
       FROM customers
       WHERE LOWER(TRIM(customer_name)) = LOWER(?)
       LIMIT 1`,
      [name]
    );
  }

  if (existingByName.length > 0) {
    if (matchByNameOnly && normalizedEmail) {
      await connection.execute(
        `UPDATE customers
         SET email = ?
         WHERE customer_id = ?`,
        [normalizedEmail, existingByName[0].customer_id]
      );
    }
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
async function getCustomerOverview(requestedPeriod = "1w", createdBy) {
  const period = normalizePeriod(requestedPeriod);
  if (!period) {
    throw new Error("Invalid period. Allowed: 1w, 1m, 3m, 1y, 2y.");
  }
  const customerPeriod = getPeriodCondition("c.created_at", period);
  const quotationPeriod = getPeriodCondition("quotation_date", period);
  const quotationOwnerCondition =
    createdBy == null ? "" : "AND created_by = ?";
  const customerOwnerCondition =
    createdBy == null
      ? ""
      : `AND (
          c.created_by = ?
          OR EXISTS (
            SELECT 1
            FROM quotations q
            WHERE q.customer_id = c.customer_id
              AND q.created_by = ?
          )
          OR EXISTS (
            SELECT 1
            FROM invoices i
            WHERE i.customer_id = c.customer_id
              AND i.created_by = ?
          )
        )`;
  const [[customerSummary]] = await db.execute(
    `SELECT
       COUNT(*) AS total_customers,
       COALESCE(SUM(DATE(c.created_at) = CURDATE()), 0) AS customers_added_today
     FROM customers c
    WHERE ${customerPeriod}
      ${customerOwnerCondition}`,
    createdBy == null ? [] : [createdBy, createdBy, createdBy]
  );

  const [[quotationSummary]] = await db.execute(
    `SELECT COUNT(*) AS accepted_quotations
     FROM quotations
     WHERE customer_status IN ('Customer Accepted', 'Accepted')
     AND ${quotationPeriod}
      ${quotationOwnerCondition}`,
    createdBy == null ? [] : [createdBy]
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

async function getMostQuotedCustomers(requestedPeriod = "1w", createdBy) {
  const period = normalizePeriod(requestedPeriod);
  if (!period) {
    throw new Error("Invalid period. Allowed: 1w, 1m, 3m, 1y, 2y.");
  }
  const quotationPeriod = getPeriodCondition("q.quotation_date", period);
  const ownerCondition = createdBy == null ? "" : "AND q.created_by = ?";
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
       ${ownerCondition}
     GROUP BY
       c.customer_id,
       c.customer_name,
       c.company_name,
       c.email,
       c.phone
     ORDER BY
       quotation_count DESC,
       total_quotation_value DESC`,
    createdBy == null ? [] : [createdBy]
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
