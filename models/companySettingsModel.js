
const db = require("../config/db");

// The earliest settings row is the canonical shared company configuration.
async function getCompanySettings() {
  const [rows] = await db.execute(
    `SELECT
       setting_id,
       company_name,
       company_logo,
       company_signature,
       company_address,
       contact_number,
       email_address,
       bank_name,
       bank_account_name,
       bank_account_number,
       bank_branch,
       bank_swift_code,
       default_terms_and_conditions,
       pdf_heading,
       pdf_subheading,
       pdf_custom_lines,
       pdf_custom_sections,
       pdf_footer_note,
       quotation_thank_you_title,
       quotation_thank_you_message,
       quotation_prepared_by,
       quotation_prepared_by_services,
       quotation_ceo_name,
       quotation_ceo_designation,
       updated_by,
       created_at,
       updated_at
     FROM company_settings
     ORDER BY setting_id ASC
     LIMIT 1`
  );

  const settings = rows[0] || null;
  if (settings?.pdf_custom_sections) {
    try {
      // Return the JSON-backed sections in their structured form.
      settings.pdf_custom_sections = JSON.parse(settings.pdf_custom_sections);
    } catch (error) {
      console.error("Could not parse company PDF custom sections:", error);
    }
  }
  return settings;
}

async function saveCompanySettings(settings, updatedBy) {
  const existing = await getCompanySettings();
  // Store structured sections in the LONGTEXT column as JSON.
  const customSections =
    settings.pdf_custom_sections === undefined ||
    settings.pdf_custom_sections === null
      ? null
      : typeof settings.pdf_custom_sections === "string"
        ? settings.pdf_custom_sections
        : JSON.stringify(settings.pdf_custom_sections);

  const values = [
    settings.company_name,
    settings.company_logo ?? null,
    settings.company_signature ?? null,
    settings.company_address ?? null,
    settings.contact_number ?? null,
    settings.email_address ?? null,
    settings.bank_name ?? null,
    settings.bank_account_name ?? null,
    settings.bank_account_number ?? null,
    settings.bank_branch ?? null,
    settings.bank_swift_code ?? null,
    settings.default_terms_and_conditions ?? null,
    settings.pdf_heading ?? null,
    settings.pdf_subheading ?? null,
    settings.pdf_custom_lines ?? null,
    customSections,
    settings.pdf_footer_note ?? null,
    settings.quotation_thank_you_title ?? null,
    settings.quotation_thank_you_message ?? null,
    settings.quotation_prepared_by ?? null,
    settings.quotation_prepared_by_services ?? null,
    settings.quotation_ceo_name ?? null,
    settings.quotation_ceo_designation ?? null,
    updatedBy ?? null,
  ];

  if (existing) {
    await db.execute(
      `UPDATE company_settings
       SET company_name = ?,
           company_logo = ?,
           company_signature = ?,
           company_address = ?,
           contact_number = ?,
           email_address = ?,
           bank_name = ?,
           bank_account_name = ?,
           bank_account_number = ?,
           bank_branch = ?,
           bank_swift_code = ?,
           default_terms_and_conditions = ?,
           pdf_heading = ?,
           pdf_subheading = ?,
           pdf_custom_lines = ?,
           pdf_custom_sections = ?,
           pdf_footer_note = ?,
           quotation_thank_you_title = ?,
           quotation_thank_you_message = ?,
           quotation_prepared_by = ?,
           quotation_prepared_by_services = ?,
           quotation_ceo_name = ?,
           quotation_ceo_designation = ?,
           updated_by = ?
       WHERE setting_id = ?`,
      [...values, existing.setting_id]
    );
  } else {
    await db.execute(
      `INSERT INTO company_settings (
         company_name,
         company_logo,
         company_signature,
         company_address,
         contact_number,
         email_address,
         bank_name,
         bank_account_name,
         bank_account_number,
         bank_branch,
         bank_swift_code,
         default_terms_and_conditions,
         pdf_heading,
         pdf_subheading,
         pdf_custom_lines,
         pdf_custom_sections,
         pdf_footer_note,
         quotation_thank_you_title,
         quotation_thank_you_message,
         quotation_prepared_by,
         quotation_prepared_by_services,
         quotation_ceo_name,
         quotation_ceo_designation,
         updated_by
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      values
    );
  }

  return getCompanySettings();
}

module.exports = {
  getCompanySettings,
  saveCompanySettings,
};
