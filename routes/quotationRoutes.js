const express = require("express");

const {
  getQuotationItemOptions,
  getNextQuotationNumberPreview,
  getQuotations,
  getQuotation,
  getQuotationPdf,
  addQuotation,
  updateQuotation,
  updateQuotationStatus,
  updateQuotationWorkCompletion,
  updateCustomerQuotationStatus, // New controller function
  deleteQuotation,
  submitQuotationForApproval,
  approveQuotation,
  rejectQuotation,
  copyQuotation,
} = require("../controllers/quotationController");

const authMiddleware = require("../middleware/authMiddleware");
const {
  listServices,
  addService,
  editService,
  removeService,
} = require("../controllers/serviceCatalogController");
const superAdminMiddleware = authMiddleware.superAdminMiddleware;

const router = express.Router();

// All quotation routes require a valid JWT token.
router.use(authMiddleware);

// Get quotation item/service options
router.get("/item-options", getQuotationItemOptions);
router.get("/next-number", getNextQuotationNumberPreview);

// Manage quotation form service catalog
router.get("/services", listServices);
router.post("/services", superAdminMiddleware, addService);
router.put("/services/:id", superAdminMiddleware, editService);
router.delete("/services/:id", superAdminMiddleware, removeService);

// Get quotations with optional filters and search
router.get("/", getQuotations);

// Create a new quotation
router.post("/", addQuotation);

// Submit a quotation for Super Admin approval
router.post("/:id/submit-approval", submitQuotationForApproval);

// Approve a pending quotation (Super Admin only)
router.post("/:id/approve", approveQuotation);

// Reject a pending quotation (Super Admin only)
router.post("/:id/reject", rejectQuotation);

// Create a new customer-backed copy of an existing quotation.
router.post("/:id/copy", copyQuotation);

// Update quotation status (Draft or Sent)
router.patch("/:id/status", updateQuotationStatus);

// Record work completion for a quotation that has been invoiced.
router.patch("/:id/work-completion", updateQuotationWorkCompletion);

// Update customer quotation status (Sent, Accepted, Rejected) - New Route
router.patch("/:id/customer-status", updateCustomerQuotationStatus);

// Download a quotation after Super Admin approval.
router.get("/:id/pdf", getQuotationPdf);

// Get one quotation by ID
router.get("/:id", getQuotation);

// Update a quotation
router.put("/:id", updateQuotation);

// Delete a quotation
router.delete("/:id", deleteQuotation);

module.exports = router;