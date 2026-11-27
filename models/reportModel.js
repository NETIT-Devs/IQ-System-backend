const db = require("../config/db");
const { getPeriodCondition } = require("../utils/periodFilter");

// Combine explicit date bounds or a preset period with an optional owner scope.
function buildDateFilter(column, filters, params, ownerColumn, ownerId) {
  const conditions = [];

  if (filters.startDate) {
    conditions.push(`${column} >= ?`);
    params.push(filters.startDate);
  }

  if (filters.endDate) {
    conditions.push(`${column} < DATE_ADD(?, INTERVAL 1 DAY)`);
    params.push(filters.endDate);
  }

  if (!filters.startDate && !filters.endDate) {
    conditions.push(getPeriodCondition(column, filters.period));
  }

  if (ownerColumn && ownerId !== undefined && ownerId !== null) {
    conditions.push(`${ownerColumn} = ?`);
    params.push(ownerId);
  }

  return conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
}

async function getReportSummary(filters, ownerId) {
  const invoiceParams = [];
  const invoiceDateFilter = buildDateFilter(
    "invoice_date",
    filters,
    invoiceParams,
    "created_by",
    ownerId
  );
  const quotationParams = [];
  const quotationDateFilter = buildDateFilter(
    "quotation_date",
    filters,
    quotationParams,
    "created_by",
    ownerId
  );

  const [[invoiceSummary]] = await db.execute(
    `SELECT
       COUNT(*) AS totalInvoices,
       COALESCE(SUM(CASE WHEN balance_due <= 0 THEN 1 ELSE 0 END), 0) AS paidInvoices,
       COALESCE(SUM(CASE WHEN balance_due > 0 AND due_date < CURDATE() THEN 1 ELSE 0 END), 0) AS overdueInvoices,
       COALESCE(SUM(CASE WHEN balance_due > 0 AND (due_date IS NULL OR due_date >= CURDATE()) THEN 1 ELSE 0 END), 0) AS unpaidInvoices,
       COALESCE(SUM(CASE WHEN balance_due > 0 THEN balance_due ELSE 0 END), 0) AS outstandingAmount
     FROM invoices
     ${invoiceDateFilter}`,
    invoiceParams
  );

  const [[quotationSummary]] = await db.execute(
    `SELECT COUNT(*) AS totalQuotations
     FROM quotations
     ${quotationDateFilter}`,
    quotationParams
  );

  return {
    totalInvoices: Number(invoiceSummary.totalInvoices),
    totalQuotations: Number(quotationSummary.totalQuotations),
    paidInvoices: Number(invoiceSummary.paidInvoices),
    unpaidInvoices: Number(invoiceSummary.unpaidInvoices),
    overdueInvoices: Number(invoiceSummary.overdueInvoices),
    outstandingAmount: Number(invoiceSummary.outstandingAmount),
  };
}

async function getInvoiceReport(filters, ownerId) {
  const params = [];
  const dateFilter = buildDateFilter(
    "invoice_date",
    filters,
    params,
    "created_by",
    ownerId
  );
  const [rows] = await db.execute(
    `SELECT
       invoice_id,
       invoice_number,
       customer_id,
       invoice_date,
       total_amount,
       CASE
         WHEN balance_due <= 0 THEN 'Paid'
         WHEN due_date IS NOT NULL AND due_date < CURDATE() THEN 'Overdue'
         ELSE 'Unpaid'
       END AS payment_status
     FROM invoices
     ${dateFilter}
     ORDER BY invoice_date DESC, invoice_id DESC`,
    params
  );

  return rows;
}

async function getQuotationReport(filters, ownerId) {
  const params = [];
  const dateFilter = buildDateFilter(
    "quotation_date",
    filters,
    params,
    "created_by",
    ownerId
  );
  const [rows] = await db.execute(
    `SELECT
       quotation_id,
       quotation_number,
       customer_id,
       quotation_date,
       total_amount,
       status
     FROM quotations
     ${dateFilter}
     ORDER BY quotation_date DESC, quotation_id DESC`,
    params
  );

  return rows;
}

async function getMonthlyIncome(filters, ownerId) {
  // Support existing payment schemas that use different date-column names.
  const dateCandidates = [
    "payment_date",
    "paid_at",
    "transaction_date",
    "created_at",
  ];
  const [columns] = await db.execute(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'payments'
       AND COLUMN_NAME IN (?, ?, ?, ?)`,
    dateCandidates
  );
  const availableColumns = new Set(columns.map((column) => column.COLUMN_NAME));
  const dateColumn = dateCandidates.find((candidate) =>
    availableColumns.has(candidate)
  );

  if (!dateColumn) {
    throw new Error(
      "The payments table must have a payment_date, paid_at, transaction_date, or created_at column."
    );
  }

  const params = [];
  const dateFilter = buildDateFilter(
    `\`${dateColumn}\``,
    filters,
    params,
    "received_by",
    ownerId
  );

  const [rows] = await db.execute(
    `SELECT
       DATE_FORMAT(\`${dateColumn}\`, '%b %Y') AS month_label,
       COALESCE(SUM(amount), 0) AS total_income
     FROM payments
     ${dateFilter}
     GROUP BY DATE_FORMAT(\`${dateColumn}\`, '%Y-%m')
     ORDER BY DATE_FORMAT(\`${dateColumn}\`, '%Y-%m') ASC`,
    params
  );

  return rows;
}

module.exports = {
  getReportSummary,
  getInvoiceReport,
  getQuotationReport,
  getMonthlyIncome,
};
