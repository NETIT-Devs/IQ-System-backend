
const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");

const {
  addTopic,
  listTopics,
} = require("../controllers/quotationTopicController");

const router = express.Router();
const superAdminMiddleware = authMiddleware.superAdminMiddleware;

// Admin and Super Admin can view saved topics
router.get("/", authMiddleware, listTopics);

// Only Super Admin can add topics
router.post(
  "/",
  authMiddleware,
  superAdminMiddleware,
  addTopic
);

module.exports = router;
