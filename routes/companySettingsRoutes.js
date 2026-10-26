
const express = require("express");

const authMiddleware = require("../middleware/authMiddleware");
const superAdminMiddleware = require("../middleware/superAdminMiddleware");
const uploadCompanyImage = require("../middleware/uploadCompanyImage");

const {
  getCompanySettings,
  updateCompanySettings,
  uploadCompanyLogo,
  uploadCompanySignature,
} = require("../controllers/companySettingsController");

const router = express.Router();

// Authenticated users can view company settings.
router.get("/", authMiddleware, getCompanySettings);

// Only Super Admin can update company settings.
router.put(
  "/",
  authMiddleware,
  superAdminMiddleware,
  updateCompanySettings
);

// Only Super Admin can upload the company logo.
router.post(
  "/logo",
  authMiddleware,
  superAdminMiddleware,
  uploadCompanyImage.single("company_logo"),
  uploadCompanyLogo
);

// Only Super Admin can upload the digital signature.
router.post(
  "/signature",
  authMiddleware,
  superAdminMiddleware,
  uploadCompanyImage.single("company_signature"),
  uploadCompanySignature
);

module.exports = router;
