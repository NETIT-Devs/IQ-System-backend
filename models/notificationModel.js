const db = require("../config/db");

async function createNotification({
  userId,
  title,
  message,
  type = "info",
  referenceType = null,
  referenceId = null,
}) {
  const normalizedReferenceId =
    referenceId == null ? null : Number(referenceId);
  if (
    normalizedReferenceId !== null &&
    (!Number.isInteger(normalizedReferenceId) || normalizedReferenceId <= 0)
  ) {
    throw new Error("Notification reference ID must be a positive integer.");
  }

  await db.execute(
    `INSERT INTO notifications (
       user_id,
       title,
       message,
       notification_type,
       related_type,
       related_id
     )
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      userId,
      title,
      message,
      type,
      referenceType,
      normalizedReferenceId,
    ]
  );
}

async function createNotificationsForRole(role, notification) {
  const [users] = await db.execute(
    `SELECT user_id
     FROM users
     WHERE role = ?
       AND is_active = 1`,
    [role]
  );

  for (const user of users) {
    await createNotification({
      ...notification,
      userId: user.user_id,
    });
  }
}

async function getNotifications(userId) {
  const [rows] = await db.execute(
    `SELECT
       notification_id,
       title,
       message,
       notification_type AS type,
       related_type AS reference_type,
       related_id AS reference_id,
       is_read,
       created_at
     FROM notifications
     WHERE user_id = ?
     ORDER BY created_at DESC, notification_id DESC`,
    [userId]
  );

  return rows;
}

async function markNotificationRead(notificationId, userId) {
  const [result] = await db.execute(
    `UPDATE notifications
     SET is_read = 1
     WHERE notification_id = ?
       AND user_id = ?`,
    [notificationId, userId]
  );

  return result.affectedRows > 0;
}

async function markAllNotificationsRead(userId) {
  await db.execute(
    `UPDATE notifications
     SET is_read = 1
     WHERE user_id = ?
       AND is_read = 0`,
    [userId]
  );
}

async function deleteNotification(notificationId, userId) {
  const [result] = await db.execute(
    `DELETE FROM notifications
     WHERE notification_id = ?
       AND user_id = ?`,
    [notificationId, userId]
  );

  return result.affectedRows > 0;
}

async function clearNotifications(userId) {
  await db.execute(
    `DELETE FROM notifications
     WHERE user_id = ?`,
    [userId]
  );
}

module.exports = {
  createNotification,
  createNotificationsForRole,
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  clearNotifications,
};
