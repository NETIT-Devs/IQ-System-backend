
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const db = require("./config/db");

const authRoutes = require("./routes/authRoutes");
const customerRoutes = require("./routes/customerRoutes");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Health check route
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Invoice-Quotation API is running",
  });
});

// Authentication routes
app.use("/api/auth", authRoutes);

// Customer routes
app.use("/api/customers", customerRoutes);

// Temporary customer route test
app.get("/api/customers/test", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Customer route test works",
  });
});

// Handle unknown routes
app.use((req, res) => {
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
