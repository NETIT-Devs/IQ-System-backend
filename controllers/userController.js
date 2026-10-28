
const bcrypt = require("bcryptjs");
const {
  findUserByEmail,
  createUser,
  deleteAdmin,
} = require("../models/userModel");
const { createAuditLog } = require("../models/auditLogModel");

// Create Admin account — Super Admin only
async function createAdmin(req, res) {
  try {
    const { full_name, email, password } = req.body;

    if (!full_name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Full name, email, and password are required.",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters long.",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existingUser = await findUserByEmail(normalizedEmail);

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "A user with this email already exists.",
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const userId = await createUser(
      full_name.trim(),
      normalizedEmail,
      passwordHash,
      "Admin"
    );

    await createAuditLog({
      userId: req.user?.user_id,
      userRole: req.user?.role,
      action: "Admin User Created",
      recordId: userId,
      details: `Created Admin account for ${full_name.trim()} (${normalizedEmail}).`,
    });

    return res.status(201).json({
      success: true,
      message: "Admin account created successfully.",
      user: {
        user_id: userId,
        full_name: full_name.trim(),
        email: normalizedEmail,
        role: "Admin",
      },
    });
  } catch (error) {
    console.error("Create admin error:", error);

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "A user with this email already exists.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to create Admin account.",
    });
  }
}

// Delete Admin account — Super Admin only
async function removeAdmin(req, res) {
  try {
    const userId = Number(req.params.id);

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid Admin user ID.",
      });
    }

    // Prevent deleting the currently logged-in account
    if (userId === Number(req.user.user_id)) {
      return res.status(400).json({
        success: false,
        message: "You cannot delete your own account.",
      });
    }

    const deletedRows = await deleteAdmin(userId);

    if (deletedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Admin account not found.",
      });
    }

    await createAuditLog({
      userId: req.user?.user_id,
      userRole: req.user?.role,
      action: "Admin User Deleted",
      recordId: userId,
      details: "Deleted Admin account.",
    });

    return res.status(200).json({
      success: true,
      message: "Admin account deleted successfully.",
    });
  } catch (error) {
    console.error("Delete admin error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete Admin account.",
    });
  }
}

module.exports = {
  createAdmin,
  removeAdmin,
};
