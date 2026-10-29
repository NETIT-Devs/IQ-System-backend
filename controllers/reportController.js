const {
  getReportSummary,
  getInvoiceReport,
  getQuotationReport,
  getMonthlyIncome,
} = require("../models/reportModel");

function getDateFilters(req, res) {
  const { startDate, endDate } = req.query;
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;

  for (const [label, value] of [
    ["startDate", startDate],
    ["endDate", endDate],
  ]) {
    if (value !== undefined && (typeof value !== "string" || !datePattern.test(value))) {
      res.status(400).json({
        success: false,
        message: `${label} must use YYYY-MM-DD format.`,
      });
      return null;
    }

    if (typeof value === "string") {
      const parsedDate = new Date(`${value}T00:00:00.000Z`);

      if (
        Number.isNaN(parsedDate.getTime()) ||
        parsedDate.toISOString().slice(0, 10) !== value
      ) {
        res.status(400).json({
          success: false,
          message: `${label} is not a valid date.`,
        });
        return null;
      }
    }
  }

  if (startDate && endDate && startDate > endDate) {
    res.status(400).json({
      success: false,
      message: "startDate cannot be after endDate.",
    });
    return null;
  }

  return { startDate, endDate };
}

function handleReportError(res, error, reportName) {
  console.error(`${reportName} report error:`, error);
  return res.status(500).json({
    success: false,
    message: `Failed to retrieve ${reportName} report.`,
  });
}

async function getSummary(req, res) {
  const filters = getDateFilters(req, res);
  if (!filters) return;

  try {
    const data = await getReportSummary(filters);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return handleReportError(res, error, "summary");
  }
}

async function getInvoices(req, res) {
  const filters = getDateFilters(req, res);
  if (!filters) return;

  try {
    const data = await getInvoiceReport(filters);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return handleReportError(res, error, "invoice");
  }
}

async function getQuotations(req, res) {
  const filters = getDateFilters(req, res);
  if (!filters) return;

  try {
    const data = await getQuotationReport(filters);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return handleReportError(res, error, "quotation");
  }
}

async function getIncome(req, res) {
  const filters = getDateFilters(req, res);
  if (!filters) return;

  try {
    const data = await getMonthlyIncome(filters);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return handleReportError(res, error, "monthly income");
  }
}

module.exports = {
  getSummary,
  getInvoices,
  getQuotations,
  getIncome,
};
