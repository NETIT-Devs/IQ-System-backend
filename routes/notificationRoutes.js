const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const {
  listNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  removeNotification,
  clearAllNotifications,
} = require("../controllers/notificationController");

const router = express.Router();

router.use(authMiddleware);

router.get("/", listNotifications);
router.put("/read-all", markAllNotificationsAsRead);
router.delete("/clear-all", clearAllNotifications);
router.put("/:id/read", markNotificationAsRead);
router.delete("/:id", removeNotification);

module.exports = router;
