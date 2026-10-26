
const db = require("../config/db");

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
       updated_by,
       created_at,
       updated_at
     FROM company_settings
     ORDER BY setting_id ASC
     LIMIT 1`
  );

  return rows[0] || null;
}

async function saveCompanySettings(settings, updatedBy) {
  const existing = await getCompanySettings();

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
         updated_by
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      values
    );
  }

  return getCompanySettings();
}

module.exports = {
  getCompanySettings,
  saveCompanySettings,
};
