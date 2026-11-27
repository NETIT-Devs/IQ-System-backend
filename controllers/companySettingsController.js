
const db = require("../config/db");

const {
  getCompanySettings: findCompanySettings,
  saveCompanySettings,
} = require("../models/companySettingsModel");

// Restrict updates to known settings fields instead of accepting arbitrary columns.
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
  "pdf_heading",
  "pdf_subheading",
  "pdf_custom_lines",
  "pdf_custom_sections",
  "pdf_footer_note",
  "quotation_thank_you_title",
  "quotation_thank_you_message",
  "quotation_prepared_by",
  "quotation_prepared_by_services",
  "quotation_ceo_name",
  "quotation_ceo_designation",
];

const textFields = editableFields.filter(
  (field) => field !== "pdf_custom_sections"
);

function sendCompanySettingsError(res, error, operation) {
  console.error(`${operation} company settings error:`, error.message);

  if (error.code === "ER_BAD_FIELD_ERROR") {
    return res.status(503).json({
      success: false,
      message:
        "Company Settings database schema is missing PDF template columns. Apply the 20261118 and 20261124 Company Settings migrations, then retry.",
    });
  }

  return res.status(500).json({
    success: false,
    message:
      operation === "Get"
        ? "Failed to retrieve company settings."
        : "Failed to save company settings.",
  });
}

async function getCompanySettings(req, res) {
  try {
    const companySettings = await findCompanySettings();

    return res.status(200).json({
      success: true,
      companySettings,
    });
  } catch (error) {
    return sendCompanySettingsError(res, error, "Get");
  }
}

async function updateCompanySettings(req, res) {
  try {
    const current = await findCompanySettings();
    const body = req.body || {};
    const settings = {};

    // Preserve existing values when a request only updates part of the settings.
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

    for (const field of textFields) {
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

    if (
      settings.pdf_custom_sections !== null &&
      !Array.isArray(settings.pdf_custom_sections) &&
      typeof settings.pdf_custom_sections !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: "pdf_custom_sections must be an array, JSON string, or null.",
      });
    }

    if (typeof settings.pdf_custom_sections === "string") {
      try {
        const sections = JSON.parse(settings.pdf_custom_sections);
        if (!Array.isArray(sections)) {
          throw new Error("Custom sections must be an array.");
        }
        settings.pdf_custom_sections = sections;
      } catch {
        return res.status(400).json({
          success: false,
          message: "pdf_custom_sections must contain a valid JSON array.",
        });
      }
    }

    if (
      settings.pdf_custom_sections &&
      (settings.pdf_custom_sections.length > 50 ||
        settings.pdf_custom_sections.some(
          (section) =>
            !section ||
            typeof section !== "object" ||
            Array.isArray(section) ||
            (section.heading !== undefined &&
              typeof section.heading !== "string") ||
            (section.sub_text !== undefined &&
              typeof section.sub_text !== "string")
        ))
    ) {
      return res.status(400).json({
        success: false,
        message:
          "pdf_custom_sections must contain at most 50 sections with string headings and text.",
      });
    }

    if (
      settings.pdf_footer_note !== null &&
      settings.pdf_footer_note.length > 10000
    ) {
      return res.status(400).json({
        success: false,
        message: "pdf_footer_note must be 10000 characters or fewer.",
      });
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
    return sendCompanySettingsError(res, error, "Update");
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
