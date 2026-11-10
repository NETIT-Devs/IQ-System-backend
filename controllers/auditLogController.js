const { getAuditLogs } = require("../models/auditLogModel");
const { normalizePeriod } = require("../utils/periodFilter");

async function listAuditLogs(req, res) {
  const period = normalizePeriod(req.query.period);
  if (!period) {
    return res.status(400).json({
      success: false,
      message: "Invalid period. Allowed: 1w, 1m, 3m, 1y, 2y.",
    });
  }

  try {
    const auditLogs = await getAuditLogs(period);

    return res.status(200).json({
      success: true,
      auditLogs,
      period,
    });
  } catch (error) {
    console.error("Get audit logs error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve audit logs.",
    });
  }
}

module.exports = {
  listAuditLogs,
};
