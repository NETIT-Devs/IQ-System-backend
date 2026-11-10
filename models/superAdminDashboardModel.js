
const db = require("../config/db");
const { getPeriodCondition, normalizePeriod } = require("../utils/periodFilter");

function getDashboardPeriod(period) {
  const normalized = normalizePeriod(period);
  if (!normalized) {
    throw new Error("Invalid period. Allowed: 1w, 1m, 3m, 1y, 2y.");
  }
  return normalized;
}

// 1. Dashboard overview
async function getDashboardOverview(requestedPeriod) {
  const period = getDashboardPeriod(requestedPeriod);
  const [customerRows] = await db.query(`
    SELECT COUNT(*) AS total_customers
    FROM customers
    WHERE ${getPeriodCondition("created_at", period)}
  `);

  const [quotationRows] = await db.query(`
    SELECT COUNT(*) AS total_quotations
    FROM quotations
    WHERE ${getPeriodCondition("quotation_date", period)}
  `);

  const [invoiceRows] = await db.query(`
    SELECT
      COUNT(*) AS total_invoices,
      COALESCE(SUM(
        CASE
          WHEN balance_due > 0 THEN balance_due
          ELSE 0
        END
      ), 0) AS outstanding_balance
    FROM invoices
    WHERE ${getPeriodCondition("invoice_date", period)}
  `);

  return {
    totalCustomers: Number(customerRows[0].total_customers),
    totalQuotations: Number(quotationRows[0].total_quotations),
    totalInvoices: Number(invoiceRows[0].total_invoices),
    outstandingBalance: Number(invoiceRows[0].outstanding_balance),
  };
}

// 2. Financial overview
async function getFinancialOverview(requestedPeriod) {
  const period = getDashboardPeriod(requestedPeriod);
  const [incomeRows] = await db.query(`
    SELECT COALESCE(SUM(amount), 0) AS total_income
    FROM payments
    WHERE ${getPeriodCondition("payment_date", period)}
  `);

  return {
    income: Number(incomeRows[0].total_income),
    expenses: 0,
    expenseTrackingConfigured: false,
    message: "Expense tracking is not configured yet.",
  };
}

// 3. Invoice status overview
async function getInvoiceStatusOverview(requestedPeriod) {
  const period = getDashboardPeriod(requestedPeriod);
  const [rows] = await db.query(`
    SELECT
      COUNT(*) AS total_invoices,

      COALESCE(SUM(
        CASE
          WHEN balance_due <= 0 THEN 1
          ELSE 0
        END
      ), 0) AS paid_invoices,

      COALESCE(SUM(
        CASE
          WHEN amount_paid > 0 AND balance_due > 0 THEN 1
          ELSE 0
        END
      ), 0) AS partially_paid_invoices,

      COALESCE(SUM(
        CASE
          WHEN amount_paid = 0 AND balance_due > 0 THEN 1
          ELSE 0
        END
      ), 0) AS unpaid_invoices,

      COALESCE(SUM(
        CASE
          WHEN balance_due > 0
            AND due_date IS NOT NULL
            AND due_date < CURDATE()
          THEN 1
          ELSE 0
        END
      ), 0) AS overdue_invoices,

      COALESCE(SUM(
        CASE
          WHEN balance_due > 0 THEN balance_due
          ELSE 0
        END
      ), 0) AS outstanding_balance

    FROM invoices
    WHERE ${getPeriodCondition("invoice_date", period)}
  `);

  const row = rows[0];

  return {
    totalInvoices: Number(row.total_invoices),
    paidInvoices: Number(row.paid_invoices),
    partiallyPaidInvoices: Number(row.partially_paid_invoices),
    unpaidInvoices: Number(row.unpaid_invoices),
    overdueInvoices: Number(row.overdue_invoices),
    outstandingBalance: Number(row.outstanding_balance),
  };
}

module.exports = {
  getDashboardOverview,
  getFinancialOverview,
  getInvoiceStatusOverview,
};
