-- Add the configurable PDF footer and initialize existing settings with a default.
ALTER TABLE company_settings
  ADD COLUMN pdf_footer_note TEXT NULL;

UPDATE company_settings
SET pdf_footer_note = CONCAT(
  'Thank You', CHAR(10), CHAR(10),
  'We appreciate the opportunity to work with your business.', CHAR(10),
  'NetIT Technology is committed to delivering a modern, scalable, and professional real estate platform that connects property buyers, sellers, landlords, and real estate agents through an advanced online property marketplace.', CHAR(10),
  'Our goal is to develop a reliable property listing platform that simplifies property advertising, improves property discovery, and generates more customer inquiries and business opportunities.', CHAR(10), CHAR(10),
  'Prepared By:', CHAR(10),
  'NetIT Technology', CHAR(10),
  'Web Development • Software Solutions • Digital Marketing', CHAR(10), CHAR(10),
  'D M N K DISSANAYAKA', CHAR(10), CHAR(10),
  'CEO(NetIT Technology)'
)
WHERE pdf_footer_note IS NULL OR TRIM(pdf_footer_note) = '';
