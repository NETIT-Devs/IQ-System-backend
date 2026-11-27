const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const superAdminMiddleware = authMiddleware.superAdminMiddleware;
const { listAuditLogs } = require("../controllers/auditLogController");

const router = express.Router();

// Audit history spans accounts, so only Super Admins can read it.
router.get("/", authMiddleware, superAdminMiddleware, listAuditLogs);

module.exports = router;
