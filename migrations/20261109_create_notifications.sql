-- Store user-scoped notifications and their read state.
CREATE TABLE IF NOT EXISTS notifications (
  notification_id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  notification_type VARCHAR(50) NULL DEFAULT 'General',
  related_type VARCHAR(50) NULL,
  related_id INT UNSIGNED NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (notification_id),
  KEY idx_user_id (user_id),
  KEY idx_is_read (is_read),
  KEY idx_created_at (created_at),
  CONSTRAINT fk_notifications_user
    FOREIGN KEY (user_id)
    REFERENCES users (user_id)
    ON DELETE CASCADE
);
