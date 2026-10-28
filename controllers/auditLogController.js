const { getAuditLogs } = require("../models/auditLogModel");

async function listAuditLogs(req, res) {
  try {
    const auditLogs = await getAuditLogs();

    return res.status(200).json({
      success: true,
      auditLogs,
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
