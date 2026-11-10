
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");

// Import database connection
const db = require("./config/db");

// Import API routes
const authRoutes = require("./routes/authRoutes");
const customerRoutes = require("./routes/customerRoutes");
const quotationRoutes = require("./routes/quotationRoutes");
const invoiceRoutes = require("./routes/invoiceRoutes");
const auditLogRoutes = require("./routes/auditLogRoutes");
const companySettingsRoutes = require("./routes/companySettingsRoutes");
const userRoutes = require("./routes/userRoutes");
const notificationRoutes = require("./routes/notificationRoutes");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Health check
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Invoice-Quotation API is running",
  });
});

// Authentication API
app.use("/api/auth", authRoutes);

// Customer API
app.use("/api/customers", customerRoutes);

// Quotation API
app.use("/api/quotations", quotationRoutes);

// Invoice API
app.use("/api/invoices", invoiceRoutes);

// Audit log API
app.use("/api/audit-logs", auditLogRoutes);

// Company settings API
app.use("/api/company-settings", companySettingsRoutes);

// User management API
app.use("/api/users", userRoutes);

// Notifications API
app.use("/api/notifications", notificationRoutes);

// 404 - Route not found
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "API route not found.",
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("Server error:", err.message);

  res.status(500).json({
    success: false,
    message: "Internal server error.",
  });
});

// Server configuration
const PORT = process.env.PORT || 5000;

// Start server after database connection
async function startServer() {
  try {
    await db.query("SELECT 1");

    console.log("MySQL database connected successfully!");

    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Database connection failed:", error.message);
    process.exit(1);
  }
}

startServer();
