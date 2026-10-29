require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");

const db = require("./config/db");

// Route imports
const authRoutes = require("./routes/authRoutes");
const customerRoutes = require("./routes/customerRoutes");
const userRoutes = require("./routes/userRoutes");
const quotationRoutes = require("./routes/quotationRoutes");
const quotationTopicRoutes = require("./routes/quotationTopicRoutes");
const quotationTypeRoutes = require("./routes/quotationTypeRoutes");
const companySettingsRoutes = require("./routes/companySettingsRoutes");
const auditLogRoutes = require("./routes/auditLogRoutes");
const adminDashboardRoutes = require("./routes/adminDashboardRoutes");
const superAdminDashboardRoutes = require("./routes/superAdminDashboardRoutes");
const reportRoutes = require("./routes/reportRoutes");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Health check
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Invoice-Quotation API is running",
  });
});

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/users", userRoutes);
app.use("/api/quotations", quotationRoutes);
app.use("/api/quotation-topics", quotationTopicRoutes);
app.use("/api/quotation-types", quotationTypeRoutes);
app.use("/api/company-settings", companySettingsRoutes);
app.use("/api/audit-logs", auditLogRoutes);
app.use("/api/admin/dashboard", adminDashboardRoutes);
app.use("/api/super-admin/dashboard", superAdminDashboardRoutes);
app.use("/api/reports", reportRoutes);

// Handle unknown routes
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("Server error:", err);

  res.status(err.status || 500).json({
    success: false,
    message: "Internal server error",
  });
});

const PORT = process.env.PORT || 5000;

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