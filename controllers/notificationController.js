const notificationModel = require("../models/notificationModel");

async function listNotifications(req, res) {
  try {
    const notifications = await notificationModel.getNotifications(
      req.user.user_id
    );

    return res.status(200).json({
      success: true,
      notifications,
    });
  } catch (error) {
    console.error("Get notifications error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve notifications.",
    });
  }
}

async function markNotificationAsRead(req, res) {
  try {
    const notificationId = Number(req.params.id);
    if (!Number.isInteger(notificationId) || notificationId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid notification ID.",
      });
    }

    const updated = await notificationModel.markNotificationRead(
      notificationId,
      req.user.user_id
    );

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: "Notification not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Notification marked as read.",
    });
  } catch (error) {
    console.error("Mark notification as read error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update notification.",
    });
  }
}

async function markAllNotificationsAsRead(req, res) {
  try {
    await notificationModel.markAllNotificationsRead(req.user.user_id);

    return res.status(200).json({
      success: true,
      message: "All notifications marked as read.",
    });
  } catch (error) {
    console.error("Mark all notifications as read error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update notifications.",
    });
  }
}

async function removeNotification(req, res) {
  try {
    const notificationId = Number(req.params.id);
    if (!Number.isInteger(notificationId) || notificationId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid notification ID.",
      });
    }

    const deleted = await notificationModel.deleteNotification(
      notificationId,
      req.user.user_id
    );

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Notification not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Notification deleted.",
    });
  } catch (error) {
    console.error("Delete notification error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete notification.",
    });
  }
}

async function clearAllNotifications(req, res) {
  try {
    await notificationModel.clearNotifications(req.user.user_id);

    return res.status(200).json({
      success: true,
      message: "All notifications deleted.",
    });
  } catch (error) {
    console.error("Clear notifications error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete notifications.",
    });
  }
}

module.exports = {
  listNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  removeNotification,
  clearAllNotifications,
};
