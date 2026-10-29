
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { findUserByEmail } = require("../models/userModel");
const db = require("../config/db");
const { createEmailTransporter } = require("../config/email");
const { createAuditLog } = require("../models/auditLogModel");

async function login(req, res) {
  try {
    const { email, password } = req.body;

    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      !email.trim() ||
      !password
    ) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required.",
      });
    }

    const user = await findUserByEmail(email.trim());

    if (
      !user ||
      !user.is_active ||
      !(await bcrypt.compare(password, user.password_hash))
    ) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    if (!["Admin", "Super Admin"].includes(user.role)) {
      return res.status(403).json({
        success: false,
        message: "Access denied.",
      });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({
        success: false,
        message: "Server configuration error.",
      });
    }

    const token = jwt.sign(
      {
        user_id: user.user_id,
        role: user.role,
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    await createAuditLog({
      userId: user.user_id,
      userName: user.full_name || user.email,
      userRole: user.role,
      action: "User Login",
      details: "Signed in successfully.",
    });

    return res.status(200).json({
      success: true,
      message: "Login successful.",
      token,
      user: {
        user_id: user.user_id,
        full_name: user.full_name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Login error:", error.message);

    return res.status(500).json({
      success: false,
      message: "An internal server error occurred.",
    });
  }
}

async function changePassword(req, res) {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;
    const userId = req.user?.user_id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    if (
      typeof currentPassword !== "string" ||
      typeof newPassword !== "string" ||
      typeof confirmPassword !== "string" ||
      !currentPassword ||
      !newPassword ||
      !confirmPassword
    ) {
      return res.status(400).json({
        success: false,
        message: "All password fields are required.",
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: "New password must be at least 8 characters long.",
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "New passwords do not match.",
      });
    }

    if (currentPassword === newPassword) {
      return res.status(400).json({
        success: false,
        message: "New password must differ from current password.",
      });
    }

    const [rows] = await db.execute(
      `SELECT user_id, password_hash
       FROM users
       WHERE user_id = ? AND is_active = 1
       LIMIT 1`,
      [userId]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "User not found or inactive.",
      });
    }

    const user = rows[0];

    const isCurrentPasswordValid = await bcrypt.compare(
      currentPassword,
      user.password_hash
    );

    if (!isCurrentPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Current password is incorrect.",
      });
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 12);

    await db.execute(
      `UPDATE users
       SET password_hash = ?, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = ?`,
      [newPasswordHash, userId]
    );

    // Invalidate outstanding reset tokens after password change.
    await db.execute(
      `UPDATE password_reset_tokens
       SET used_at = CURRENT_TIMESTAMP
       WHERE user_id = ? AND used_at IS NULL`,
      [userId]
    );

    await createAuditLog({
      userId,
      userRole: req.user?.role,
      action: "Password Changed",
      details: "Changed account password.",
    });

    return res.status(200).json({
      success: true,
      message: "Password changed successfully. Please log in again.",
    });
  } catch (error) {
    console.error("Change password error:", error.message);

    return res.status(500).json({
      success: false,
      message: "An internal server error occurred.",
    });
  }
}

async function forgotPassword(req, res) {
  try {
    const { email } = req.body;

    if (typeof email !== "string" || !email.trim()) {
      return res.status(400).json({
        success: false,
        message: "Email address is required.",
      });
    }

    const user = await findUserByEmail(email.trim());

    // Use the same response whether the account exists or not.
    const genericResponse = {
      success: true,
      message:
        "If an eligible account exists, password reset instructions will be sent.",
    };

    if (!user || !user.is_active) {
      return res.status(200).json(genericResponse);
    }

    if (!["Admin", "Super Admin"].includes(user.role)) {
      return res.status(200).json(genericResponse);
    }

    // Do not create a reset token until email delivery is configured.
    if (
      !process.env.EMAIL_USER ||
      !process.env.EMAIL_APP_PASSWORD ||
      !process.env.FRONTEND_URL
    ) {
      return res.status(503).json({
        success: false,
        message:
          "Password reset email service is not configured yet. Please try again later.",
      });
    }

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await db.execute(
      `UPDATE password_reset_tokens
       SET used_at = CURRENT_TIMESTAMP
       WHERE user_id = ? AND used_at IS NULL`,
      [user.user_id]
    );

    await db.execute(
      `INSERT INTO password_reset_tokens
       (user_id, token_hash, expires_at)
       VALUES (?, ?, ?)`,
      [user.user_id, tokenHash, expiresAt]
    );

    try {
      const transporter = createEmailTransporter();
      const resetUrl =
        `${process.env.FRONTEND_URL.replace(/\/$/, "")}` +
        `/reset-password?token=${encodeURIComponent(rawToken)}`;

      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: user.email,
        subject: "Password Reset Request",
        text:
          `A password reset was requested for your account.\n\n` +
          `Use this link within 15 minutes:\n${resetUrl}\n\n` +
          `If you did not request this, you can ignore this email.`,
      });
    } catch (emailError) {
      // Invalidate the token if delivery fails.
      await db.execute(
        `UPDATE password_reset_tokens
         SET used_at = CURRENT_TIMESTAMP
         WHERE token_hash = ? AND used_at IS NULL`,
        [tokenHash]
      );

      console.error("Password reset email error:", emailError.message);

      return res.status(503).json({
        success: false,
        message:
          "Password reset email could not be sent. Please try again later.",
      });
    }

    return res.status(200).json(genericResponse);
  } catch (error) {
    console.error("Forgot password error:", error.message);

    return res.status(500).json({
      success: false,
      message: "An internal server error occurred.",
    });
  }
}

async function resetPassword(req, res) {
  try {
    const { token, newPassword, confirmPassword } = req.body;

    if (
      typeof token !== "string" ||
      !token ||
      typeof newPassword !== "string" ||
      typeof confirmPassword !== "string" ||
      !newPassword ||
      !confirmPassword
    ) {
      return res.status(400).json({
        success: false,
        message: "Token and all password fields are required.",
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters long.",
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Passwords do not match.",
      });
    }

    const tokenHash = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    const [rows] = await db.execute(
      `SELECT prt.reset_id, prt.user_id
       FROM password_reset_tokens AS prt
       INNER JOIN users AS u ON u.user_id = prt.user_id
       WHERE prt.token_hash = ?
         AND prt.used_at IS NULL
         AND prt.expires_at > NOW()
         AND u.is_active = 1
       LIMIT 1`,
      [tokenHash]
    );

    if (!rows.length) {
      return res.status(400).json({
        success: false,
        message: "Reset link is invalid or expired.",
      });
    }

    const resetRecord = rows[0];
    const newPasswordHash = await bcrypt.hash(newPassword, 12);

    const connection = await db.getConnection();

    try {
      await connection.beginTransaction();

      const [validRows] = await connection.execute(
        `SELECT reset_id
         FROM password_reset_tokens
         WHERE reset_id = ?
           AND used_at IS NULL
           AND expires_at > NOW()
         FOR UPDATE`,
        [resetRecord.reset_id]
      );

      if (!validRows.length) {
        await connection.rollback();

        return res.status(400).json({
          success: false,
          message: "Reset link is invalid or expired.",
        });
      }

      await connection.execute(
        `UPDATE users
         SET password_hash = ?, updated_at = CURRENT_TIMESTAMP
         WHERE user_id = ? AND is_active = 1`,
        [newPasswordHash, resetRecord.user_id]
      );

      await connection.execute(
        `UPDATE password_reset_tokens
         SET used_at = CURRENT_TIMESTAMP
         WHERE user_id = ? AND used_at IS NULL`,
        [resetRecord.user_id]
      );

      await connection.commit();
    } catch (transactionError) {
      await connection.rollback();
      throw transactionError;
    } finally {
      connection.release();
    }

    return res.status(200).json({
      success: true,
      message: "Password reset successfully. Please log in again.",
    });
  } catch (error) {
    console.error("Reset password error:", error.message);

    return res.status(500).json({
      success: false,
      message: "An internal server error occurred.",
    });
  }
}

module.exports = {
  login,
  changePassword,
  forgotPassword,
  resetPassword,
};
