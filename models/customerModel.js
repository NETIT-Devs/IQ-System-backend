
const db = require("../config/db");

async function getAllCustomers() {
  const [rows] = await db.execute(
    `SELECT customer_id, customer_name, company_name, email,
            phone, address, city, country, tax_number, notes,
            created_by, created_at, updated_at
     FROM customers
     ORDER BY customer_id DESC`
  );

  return rows;
}

async function createCustomer(customer) {
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

  const [result] = await db.execute(
    `INSERT INTO customers
     (customer_name, company_name, email, phone, address,
      city, country, tax_number, notes, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      customer_name,
      company_name || null,
      email || null,
      phone || null,
      address || null,
      city || null,
      country || null,
      tax_number || null,
      notes || null,
      created_by,
    ]
  );

  return result.insertId;
}

module.exports = {
  getAllCustomers,
  createCustomer,
};
