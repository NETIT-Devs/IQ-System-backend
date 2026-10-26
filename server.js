require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const db = require("./config/db");

// Route imports
const authRoutes = require("./routes/authRoutes");
const customerRoutes = require("./routes/customerRoutes");
const quotationRoutes = require("./routes/quotationRoutes");
const companySettingsRoutes = require("./routes/companySettingsRoutes");
const superAdminDashboardRoutes = require("./routes/superAdminDashboardRoutes");
const adminDashboardRoutes = require('./routes/adminDashboardRoutes');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Serve uploaded company logo and signature images
app.use(
  "/uploads",
  express.static(path.join(__dirname, "uploads"))
);

// Health check route
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Invoice-Quotation API is running",
  });
});

// Authentication routes
app.use("/api/auth", authRoutes);

console.log(
  "Registered auth routes:",
  authRoutes.stack
    .filter((layer) => layer.route)
    .map((layer) => ({
      path: `/api/auth${layer.route.path}`,
      methods: Object.keys(layer.route.methods),
    }))
);

// Debug middleware for authentication requests
app.use("/api/auth", (req, res, next) => {
  console.log("AUTH DEBUG:", req.method, req.originalUrl);
  next();
});

// Customer routes
app.use("/api/customers", customerRoutes);

// Quotation routes
app.use("/api/quotations", quotationRoutes);

// Company settings routes
app.use("/api/company-settings", companySettingsRoutes);

// Super Admin Dashboard routes
app.use("/api/super-admin/dashboard", superAdminDashboardRoutes);

// Admin Dashboard routes
app.use('/api/admin/dashboard', adminDashboardRoutes);

// Temporary customer route test
app.get("/api/customers/test", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Customer route test works",
  });
});

// Handle unknown routes
app.use((req, res) => {
  console.log("404 DEBUG:", req.method, req.originalUrl);

  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

// Start server after checking database connection
async function startServer() {
  try {
    const connection = await db.getConnection();

    console.log("MySQL database connected successfully!");

    connection.release();

    const PORT = process.env.PORT || 5000;

    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
      console.log("Active server file:", __filename);
    });
  } catch (error) {
    console.error("Database connection failed:", error.message);
    process.exit(1);
  }
}

startServer();