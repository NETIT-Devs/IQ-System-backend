
const db = require("../config/db");

const AdminDashboardModel = {
  // 1. Overview Cards Stats
  getOverviewStats: async (createdBy) => {
    const [customerCount] = await db.query(`
      SELECT COUNT(*) AS totalCustomers
      FROM customers
    `);

    const [quotationCount] = await db.query(`
      SELECT COUNT(*) AS totalQuotations
      FROM quotations
      ${createdBy == null ? "" : "WHERE created_by = ?"}
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
      ${createdBy == null ? "" : "WHERE created_by = ?"}
    `, createdBy == null ? [] : [createdBy]);

    return {
      totalCustomers: Number(customerCount[0].totalCustomers),
      totalQuotations: Number(quotationCount[0].totalQuotations),
      totalInvoices: Number(invoiceCount[0].totalInvoices),
      outstandingBalance: Number(invoiceCount[0].outstandingBalance),
    };
  },

  // 2. Financial Overview (Income vs Expenses)
  getFinancialOverview: async (createdBy) => {
    const [incomeResult] = await db.query(`
      SELECT COALESCE(SUM(p.amount), 0) AS totalIncome
      FROM payments p
      INNER JOIN invoices i
        ON i.invoice_id = p.invoice_id
      ${createdBy == null ? "" : "WHERE i.created_by = ?"}
    `, createdBy == null ? [] : [createdBy]);

    return {
      income: Number(incomeResult[0].totalIncome),
      expenses: 0,
    };
  },

  // 3. Invoice Status Distribution
  getInvoiceStatusSummary: async (createdBy) => {
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
      ${createdBy == null ? "" : "WHERE created_by = ?"}
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
