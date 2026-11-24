ALTER TABLE quotation_items
  ADD COLUMN price_text VARCHAR(500) NULL;

ALTER TABLE invoice_items
  ADD COLUMN price_text VARCHAR(500) NULL;
