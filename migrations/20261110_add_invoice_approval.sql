ALTER TABLE invoices
  ADD COLUMN approval_status ENUM(
    'Not Required',
    'Pending',
    'Approved',
    'Rejected'
  ) NOT NULL DEFAULT 'Not Required',
  ADD COLUMN approval_rejection_reason TEXT NULL,
  ADD COLUMN approval_reviewed_by INT UNSIGNED NULL,
  ADD COLUMN approval_reviewed_at DATETIME NULL,
  ADD INDEX idx_invoices_approval_status (approval_status);
