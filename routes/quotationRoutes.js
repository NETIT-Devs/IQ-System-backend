const express = require("express");

const {
  getQuotationItemOptions,
  getQuotations,
  getQuotation,
  addQuotation,
  updateQuotation,
  updateQuotationStatus,
  updateCustomerQuotationStatus, // New controller function
  deleteQuotation,
  submitQuotationForApproval,
  approveQuotation,
  rejectQuotation,
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

// Update quotation status (Draft or Sent)
router.patch("/:id/status", updateQuotationStatus);

// Update customer quotation status (Sent, Accepted, Rejected) - New Route
router.patch("/:id/customer-status", updateCustomerQuotationStatus);

// Get one quotation by ID
router.get("/:id", getQuotation);

// Update a quotation
router.put("/:id", updateQuotation);

// Delete a quotation
router.delete("/:id", deleteQuotation);

module.exports = router;