-- Store the reason provided when a quotation is rejected.
ALTER TABLE quotations
  ADD COLUMN rejection_reason TEXT NULL AFTER approval_status;
