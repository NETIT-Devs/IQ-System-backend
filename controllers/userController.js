
const bcrypt = require("bcryptjs");
const {
  findUserByEmail,
  createUser,
  getAllUsers,
  getUserById,
  updateAdmin,
  toggleAdminStatus,
  deleteAdmin,
} = require("../models/userModel");
const { createAuditLog } = require("../models/auditLogModel");

async function listUsers(req, res) {
  try {
    const users = await getAllUsers();

    return res.status(200).json({
      success: true,
      users,
    });
  } catch (error) {
    console.error("List users error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve user accounts.",
    });
  }
}

// Create Admin account — Super Admin only
async function createAdmin(req, res) {
  try {
    const { full_name, username, email, password } = req.body || {};
    const fullName =
      typeof full_name === "string"
        ? full_name.trim()
        : typeof username === "string"
          ? username.trim()
          : "";

    if (!fullName || typeof email !== "string" || typeof password !== "string") {
      return res.status(400).json({
        success: false,
        message: "Full name, email, and password are required.",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters long.",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid email address.",
      });
    }

    const existingUser = await findUserByEmail(normalizedEmail);

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "A user with this email already exists.",
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const userId = await createUser(
      fullName,
      normalizedEmail,
      passwordHash,
      "Admin"
    );

    await createAuditLog({
      userId: req.user?.user_id,
      userRole: req.user?.role,
      action: "Admin User Created",
      recordId: userId,
      details: `Created Admin account for ${fullName} (${normalizedEmail}).`,
    });

    return res.status(201).json({
      success: true,
      message: "Admin account created successfully.",
      user: {
        user_id: userId,
        full_name: fullName,
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

async function updateAdminAccount(req, res) {
  try {
    const userId = Number(req.params.id);
    const { full_name, username, email, password } = req.body || {};
    const fullName =
      typeof full_name === "string"
        ? full_name.trim()
        : typeof username === "string"
          ? username.trim()
          : "";

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID.",
      });
    }

    if (!fullName || typeof email !== "string" || !email.trim()) {
      return res.status(400).json({
        success: false,
        message: "Full name and email are required.",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid email address.",
      });
    }

    if (
      password !== undefined &&
      password !== "" &&
      (typeof password !== "string" || password.length < 6)
    ) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters long.",
      });
    }

    const targetUser = await getUserById(userId);
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: "User account not found.",
      });
    }
    if (targetUser.role !== "Admin") {
      return res.status(403).json({
        success: false,
        message: "Only Admin accounts can be edited here.",
      });
    }

    const existingUser = await findUserByEmail(normalizedEmail);
    if (existingUser && Number(existingUser.user_id) !== userId) {
      return res.status(409).json({
        success: false,
        message: "A user with this email already exists.",
      });
    }

    const passwordHash =
      typeof password === "string" && password
        ? await bcrypt.hash(password, 12)
        : null;

    await updateAdmin(userId, fullName, normalizedEmail, passwordHash);

    await createAuditLog({
      userId: req.user?.user_id,
      userRole: req.user?.role,
      action: "Admin User Updated",
      recordId: userId,
      details: `Updated Admin account for ${fullName} (${normalizedEmail}).`,
    });

    return res.status(200).json({
      success: true,
      message: "Admin account updated successfully.",
    });
  } catch (error) {
    console.error("Update admin error:", error);

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "A user with this email already exists.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to update Admin account.",
    });
  }
}

async function toggleAdminAccountStatus(req, res) {
  try {
    const userId = Number(req.params.id);

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID.",
      });
    }

    const targetUser = await getUserById(userId);
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: "User account not found.",
      });
    }
    if (targetUser.role !== "Admin") {
      return res.status(403).json({
        success: false,
        message: "Only Admin account status can be changed here.",
      });
    }

    const updatedRows = await toggleAdminStatus(userId);
    if (!updatedRows) {
      return res.status(409).json({
        success: false,
        message: "User account status was not changed.",
      });
    }

    const newStatus = targetUser.is_active ? "Inactive" : "Active";
    await createAuditLog({
      userId: req.user?.user_id,
      userRole: req.user?.role,
      action: "Admin User Status Changed",
      recordId: userId,
      details: `Changed Admin account status to ${newStatus}.`,
    });

    return res.status(200).json({
      success: true,
      message: `Admin account ${newStatus.toLowerCase()} successfully.`,
      is_active: !targetUser.is_active,
    });
  } catch (error) {
    console.error("Toggle admin status error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to change Admin account status.",
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
  listUsers,
  createAdmin,
  updateAdminAccount,
  toggleAdminAccountStatus,
  removeAdmin,
};
