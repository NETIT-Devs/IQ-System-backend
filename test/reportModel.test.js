const assert = require("node:assert/strict");
const test = require("node:test");
const db = require("../config/db");
const {
  getReportSummary,
  getInvoiceReport,
  getQuotationReport,
  getMonthlyIncome,
} = require("../models/reportModel");

// Stub database reads so report-scope tests never touch stored business data.
function mockReportQueries(t) {
  const originalExecute = db.execute;
  const queries = [];

  db.execute = async (sql, params = []) => {
    queries.push({ sql, params });

    if (sql.includes("INFORMATION_SCHEMA.COLUMNS")) {
      return [[{ COLUMN_NAME: "payment_date" }]];
    }

    if (sql.includes("AS totalInvoices")) {
      return [[{
        totalInvoices: 0,
        paidInvoices: 0,
        overdueInvoices: 0,
        unpaidInvoices: 0,
        outstandingAmount: 0,
      }]];
    }

    if (sql.includes("AS totalQuotations")) {
      return [[{ totalQuotations: 0 }]];
    }

    return [[]];
  };

  t.after(() => {
    db.execute = originalExecute;
  });

  return queries;
}

test("admin report queries are scoped to that admin's records", async (t) => {
  const queries = mockReportQueries(t);
  const filters = { period: "1m" };
  const ownerId = 42;

  await getReportSummary(filters, ownerId);
  await getInvoiceReport(filters, ownerId);
  await getQuotationReport(filters, ownerId);
  await getMonthlyIncome(filters, ownerId);

  const scopedQueries = queries.filter(({ sql }) =>
    /created_by = \?|received_by = \?/.test(sql)
  );

  assert.equal(scopedQueries.length, 5);
  assert.deepEqual(
    scopedQueries.map(({ params }) => params[params.length - 1]),
    [ownerId, ownerId, ownerId, ownerId, ownerId]
  );
  assert.match(scopedQueries[4].sql, /received_by = \?/);
});

test("Super Admin report queries remain unscoped", async (t) => {
  const queries = mockReportQueries(t);

  await getReportSummary({ period: "1m" });

  assert.equal(
    queries.some(({ sql }) => /created_by = \?|received_by = \?/.test(sql)),
    false
  );
});
