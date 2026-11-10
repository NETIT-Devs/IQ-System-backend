const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const uploadDir = path.join(__dirname, "..", "uploads", "payment-slips");
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, callback) => callback(null, uploadDir),
  filename: (req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    callback(null, `${crypto.randomUUID()}${extension}`);
  },
});

const allowedTypes = new Map([
  [".pdf", "application/pdf"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
]);

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
  },
  fileFilter: (req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.get(extension) === file.mimetype) {
      return callback(null, true);
    }

    return callback(new Error("Payment slip must be a PDF, JPG, JPEG, or PNG."));
  },
});

function uploadPaymentSlip(req, res, next) {
  upload.single("payment_slip")(req, res, (error) => {
    if (!error) {
      return next();
    }

    const isSizeError = error.code === "LIMIT_FILE_SIZE";
    return res.status(isSizeError ? 413 : 400).json({
      success: false,
      message: isSizeError
        ? "Payment slip must not exceed 5 MB."
        : error.message,
    });
  });
}

module.exports = uploadPaymentSlip;
