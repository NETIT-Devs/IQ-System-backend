-- Track quotation work completion and the administrator who recorded it.
ALTER TABLE quotations
  ADD COLUMN work_completed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN work_completed_at DATETIME NULL,
  ADD COLUMN work_completed_by INT NULL;
SELECT user_id, role, is_active
FROM users
WHERE email = 'your email address';
