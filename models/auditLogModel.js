const db = require("../config/db");
const { getPeriodCondition, normalizePeriod } = require("../utils/periodFilter");

async function createAuditLog({
  userId = null,
  userName = null,
  userRole = "System",
  action,
  recordId = null,
  details = null,
}) {
  try {
    let resolvedUserName = userName;

    if (!resolvedUserName && userId) {
      const [users] = await db.execute(
        `SELECT full_name, email
         FROM users
         WHERE user_id = ?
         LIMIT 1`,
        [userId]
      );
      resolvedUserName =
        users[0]?.full_name || users[0]?.email || `User ${userId}`;
    }

    await db.execute(
      `INSERT INTO audit_logs
        (user_id, user_name, user_role, action, record_id, details)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, resolvedUserName || "System", userRole, action, recordId, details]
    );
  } catch (error) {
    console.error("Audit log write failed:", error);
  }
}

async function getAuditLogs(requestedPeriod) {
  const period = normalizePeriod(requestedPeriod);
  if (!period) {
    throw new Error("Invalid period. Allowed: 1w, 1m, 3m, 1y, 2y.");
  }

  const [rows] = await db.execute(
    `SELECT
       log_id,
       user_name,
       user_role,
       action,
       record_id,
       details,
       created_at
     FROM audit_logs
     WHERE ${getPeriodCondition("created_at", period)}
     ORDER BY created_at DESC, log_id DESC`
  );

  return rows;
}

module.exports = {
  createAuditLog,
  getAuditLogs,
};
