const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const superAdminMiddleware = authMiddleware.superAdminMiddleware;
const { listAuditLogs } = require("../controllers/auditLogController");

const router = express.Router();

router.get("/", authMiddleware, superAdminMiddleware, listAuditLogs);

module.exports = router;
