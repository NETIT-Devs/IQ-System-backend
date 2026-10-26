
const db = require("../config/db");

const {
  getCompanySettings: findCompanySettings,
  saveCompanySettings,
} = require("../models/companySettingsModel");

const editableFields = [
  "company_name",
  "company_logo",
  "company_signature",
  "company_address",
  "contact_number",
  "email_address",
  "bank_name",
  "bank_account_name",
  "bank_account_number",
  "bank_branch",
  "bank_swift_code",
  "default_terms_and_conditions",
];

async function getCompanySettings(req, res) {
  try {
    const companySettings = await findCompanySettings();

    return res.status(200).json({
      success: true,
      companySettings,
    });
  } catch (error) {
    console.error("Get company settings error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve company settings.",
    });
  }
}

async function updateCompanySettings(req, res) {
  try {
    const current = await findCompanySettings();
    const body = req.body || {};
    const settings = {};

    for (const field of editableFields) {
      settings[field] =
        body[field] !== undefined
          ? body[field]
          : current
            ? current[field]
            : null;
    }

    if (
      typeof settings.company_name !== "string" ||
      !settings.company_name.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "Company name is required.",
      });
    }

    settings.company_name = settings.company_name.trim();

    for (const field of editableFields) {
      if (
        settings[field] !== null &&
        typeof settings[field] !== "string"
      ) {
        return res.status(400).json({
          success: false,
          message: `${field} must be a string or null.`,
        });
      }
    }

    const companySettings = await saveCompanySettings(
      settings,
      req.user.user_id
    );

    return res.status(200).json({
      success: true,
      message: "Company settings saved successfully.",
      companySettings,
    });
  } catch (error) {
    console.error("Update company settings error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to save company settings.",
    });
  }
}

async function uploadCompanyImage(req, res, fieldName, label, columnName) {
  let uploadedFilePath = null;

  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: `Please select a PNG or JPG ${label} image.`,
      });
    }

    uploadedFilePath = req.file.path;

    const current = await findCompanySettings();

    if (!current) {
      return res.status(400).json({
        success: false,
        message: "Save company settings before uploading images.",
      });
    }

    const imagePath = `/uploads/${req.file.filename}`;

    await db.execute(
      `UPDATE company_settings
       SET ${columnName} = ?, updated_by = ?
       WHERE setting_id = ?`,
      [imagePath, req.user.user_id, current.setting_id]
    );

    const companySettings = await findCompanySettings();

    return res.status(200).json({
      success: true,
      message: `${label} uploaded successfully.`,
      companySettings,
    });
  } catch (error) {
    console.error(`Upload ${label} error:`, error.message);

    if (uploadedFilePath) {
      const fs = require("fs");
      fs.promises.unlink(uploadedFilePath).catch(() => {});
    }

    return res.status(500).json({
      success: false,
      message: `Failed to upload ${label}.`,
    });
  }
}

async function uploadCompanyLogo(req, res) {
  return uploadCompanyImage(
    req,
    res,
    "company_logo",
    "Company logo",
    "company_logo"
  );
}

async function uploadCompanySignature(req, res) {
  return uploadCompanyImage(
    req,
    res,
    "company_signature",
    "Digital signature",
    "company_signature"
  );
}

module.exports = {
  getCompanySettings,
  updateCompanySettings,
  uploadCompanyLogo,
  uploadCompanySignature,
};
