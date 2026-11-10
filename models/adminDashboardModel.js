
const db = require("../config/db");
const { getPeriodCondition, normalizePeriod } = require("../utils/periodFilter");

function getDashboardPeriod(period) {
  const normalized = normalizePeriod(period);
  if (!normalized) {
    throw new Error("Invalid period. Allowed: 1w, 1m, 3m, 1y, 2y.");
  }
  return normalized;
}

const AdminDashboardModel = {
  // 1. Overview Cards Stats
  getOverviewStats: async (createdBy, requestedPeriod) => {
    const period = getDashboardPeriod(requestedPeriod);
    const [customerCount] = await db.query(`
      SELECT COUNT(*) AS totalCustomers
      FROM customers
      WHERE ${getPeriodCondition("created_at", period)}
    `);

    const [quotationCount] = await db.query(`
      SELECT COUNT(*) AS totalQuotations
      FROM quotations
      WHERE ${getPeriodCondition("quotation_date", period)}
      ${createdBy == null ? "" : "AND created_by = ?"}
    `, createdBy == null ? [] : [createdBy]);

    const [invoiceCount] = await db.query(`
      SELECT
        COUNT(*) AS totalInvoices,
        COALESCE(SUM(
          CASE
            WHEN balance_due > 0 THEN balance_due
            ELSE 0
          END
        ), 0) AS outstandingBalance
      FROM invoices
      WHERE ${getPeriodCondition("invoice_date", period)}
      ${createdBy == null ? "" : "AND created_by = ?"}
    `, createdBy == null ? [] : [createdBy]);

    return {
      totalCustomers: Number(customerCount[0].totalCustomers),
      totalQuotations: Number(quotationCount[0].totalQuotations),
      totalInvoices: Number(invoiceCount[0].totalInvoices),
      outstandingBalance: Number(invoiceCount[0].outstandingBalance),
    };
  },

  // 2. Financial Overview (Income vs Expenses)
  getFinancialOverview: async (createdBy, requestedPeriod) => {
    const period = getDashboardPeriod(requestedPeriod);
    const [incomeResult] = await db.query(`
      SELECT COALESCE(SUM(p.amount), 0) AS totalIncome
      FROM payments p
      INNER JOIN invoices i
        ON i.invoice_id = p.invoice_id
      WHERE ${getPeriodCondition("p.payment_date", period)}
      ${createdBy == null ? "" : "AND i.created_by = ?"}
    `, createdBy == null ? [] : [createdBy]);

    return {
      income: Number(incomeResult[0].totalIncome),
      expenses: 0,
    };
  },

  // 3. Invoice Status Distribution
  getInvoiceStatusSummary: async (createdBy, requestedPeriod) => {
    const period = getDashboardPeriod(requestedPeriod);
    const [rows] = await db.query(`
      SELECT
        COUNT(*) AS totalInvoices,

        COALESCE(SUM(
          CASE
            WHEN balance_due <= 0 THEN 1
            ELSE 0
          END
        ), 0) AS paid,

        COALESCE(SUM(
          CASE
            WHEN amount_paid = 0 AND balance_due > 0 THEN 1
            ELSE 0
          END
        ), 0) AS unpaid,

        COALESCE(SUM(
          CASE
            WHEN balance_due > 0
              AND due_date IS NOT NULL
              AND due_date < CURDATE()
            THEN 1
            ELSE 0
          END
        ), 0) AS overdue,

        COALESCE(SUM(
          CASE
            WHEN amount_paid > 0 AND balance_due > 0 THEN 1
            ELSE 0
          END
        ), 0) AS partiallyPaid

      FROM invoices
      WHERE ${getPeriodCondition("invoice_date", period)}
      ${createdBy == null ? "" : "AND created_by = ?"}
    `, createdBy == null ? [] : [createdBy]);

    return {
      totalInvoices: Number(rows[0].totalInvoices),
      paid: Number(rows[0].paid),
      unpaid: Number(rows[0].unpaid),
      overdue: Number(rows[0].overdue),
      partiallyPaid: Number(rows[0].partiallyPaid),
    };
  },
};

module.exports = AdminDashboardModel;
