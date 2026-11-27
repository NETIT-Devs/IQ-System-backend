-- Add configurable heading, section, and sign-off fields for quotation PDFs.
ALTER TABLE company_settings
  ADD COLUMN pdf_heading VARCHAR(255) NULL,
  ADD COLUMN pdf_subheading VARCHAR(255) NULL,
  ADD COLUMN pdf_custom_lines TEXT NULL,
  ADD COLUMN pdf_custom_sections LONGTEXT NULL,
  ADD COLUMN quotation_thank_you_title VARCHAR(255) NULL,
  ADD COLUMN quotation_thank_you_message TEXT NULL,
  ADD COLUMN quotation_prepared_by VARCHAR(255) NULL,
  ADD COLUMN quotation_prepared_by_services VARCHAR(500) NULL,
  ADD COLUMN quotation_ceo_name VARCHAR(255) NULL,
  ADD COLUMN quotation_ceo_designation VARCHAR(255) NULL;
