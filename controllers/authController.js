
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

    const user = await findUserByEmail(email.trim().toLowerCase());

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

    const user = await findUserByEmail(email.trim().toLowerCase());

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

    const connection = await db.getConnection();
    let transactionStarted = false;
    let deliveryEmail;

    try {
      await connection.beginTransaction();
      transactionStarted = true;

      const [activeUsers] = await connection.execute(
        `SELECT user_id, email, role, is_active
         FROM users
         WHERE user_id = ?
         FOR UPDATE`,
        [user.user_id]
      );
      const activeUser = activeUsers[0];

      if (
        !activeUser ||
        Number(activeUser.is_active) !== 1 ||
        !["Admin", "Super Admin"].includes(activeUser.role)
      ) {
        await connection.rollback();
        transactionStarted = false;
        return res.status(200).json(genericResponse);
      }

      await connection.execute(
        `UPDATE password_reset_tokens
         SET used_at = CURRENT_TIMESTAMP
         WHERE user_id = ? AND used_at IS NULL`,
        [activeUser.user_id]
      );

      await connection.execute(
        `INSERT INTO password_reset_tokens
         (user_id, token_hash, expires_at)
         VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 15 MINUTE))`,
        [activeUser.user_id, tokenHash]
      );

      await connection.commit();
      transactionStarted = false;
      deliveryEmail = activeUser.email;
    } catch (tokenError) {
      if (transactionStarted) {
        await connection.rollback();
      }
      throw tokenError;
    } finally {
      connection.release();
    }

    try {
      const transporter = createEmailTransporter();
      const resetUrl =
        `${process.env.FRONTEND_URL.replace(/\/$/, "")}` +
        `/reset-password?token=${encodeURIComponent(rawToken)}`;

      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: deliveryEmail,
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
    const { token, newPassword, confirmPassword, newEmail } = req.body;

    if (
      typeof token !== "string" ||
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

    if (!/^[a-f0-9]{64}$/i.test(token)) {
      return res.status(400).json({
        success: false,
        message: "Reset link is invalid or expired.",
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

    if (newEmail !== undefined && newEmail !== null && typeof newEmail !== "string") {
      return res.status(400).json({
        success: false,
        message: "A valid email address is required.",
      });
    }

    const normalizedNewEmail =
      typeof newEmail === "string" && newEmail.trim()
        ? newEmail.trim().toLowerCase()
        : null;

    if (
      normalizedNewEmail &&
      (normalizedNewEmail.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedNewEmail))
    ) {
      return res.status(400).json({
        success: false,
        message: "A valid email address is required.",
      });
    }

    const tokenHash = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    const [rows] = await db.execute(
      `SELECT reset_id, user_id
       FROM password_reset_tokens
       WHERE token_hash = ?
         AND used_at IS NULL
         AND expires_at > NOW()
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
    let transactionStarted = false;

    try {
      await connection.beginTransaction();
      transactionStarted = true;

      const [activeUsers] = await connection.execute(
        `SELECT user_id, email
         FROM users
         WHERE user_id = ? AND is_active = 1
         FOR UPDATE`,
        [resetRecord.user_id]
      );

      if (!activeUsers.length) {
        await connection.rollback();
        transactionStarted = false;
        return res.status(400).json({
          success: false,
          message: "Reset link is invalid or expired.",
        });
      }

      if (normalizedNewEmail && normalizedNewEmail !== activeUsers[0].email) {
        const [existingEmails] = await connection.execute(
          `SELECT user_id
           FROM users
           WHERE email = ? AND user_id <> ?
           LIMIT 1
           FOR UPDATE`,
          [normalizedNewEmail, resetRecord.user_id]
        );

        if (existingEmails.length) {
          await connection.rollback();
          transactionStarted = false;
          return res.status(409).json({
            success: false,
            message: "That email address is already associated with an account.",
          });
        }
      }

      const [validRows] = await connection.execute(
        `SELECT reset_id
         FROM password_reset_tokens
         WHERE reset_id = ?
           AND user_id = ?
           AND token_hash = ?
           AND used_at IS NULL
           AND expires_at > NOW()
         FOR UPDATE`,
        [resetRecord.reset_id, resetRecord.user_id, tokenHash]
      );

      if (!validRows.length) {
        await connection.rollback();
        transactionStarted = false;

        return res.status(400).json({
          success: false,
          message: "Reset link is invalid or expired.",
        });
      }

      const [passwordUpdate] = await connection.execute(
        `UPDATE users
         SET email = COALESCE(?, email),
             password_hash = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = ? AND is_active = 1`,
        [normalizedNewEmail, newPasswordHash, resetRecord.user_id]
      );

      if (passwordUpdate.affectedRows !== 1) {
        await connection.rollback();
        transactionStarted = false;
        return res.status(400).json({
          success: false,
          message: "Reset link is invalid or expired.",
        });
      }

      const [tokenUpdate] = await connection.execute(
        `UPDATE password_reset_tokens
         SET used_at = CURRENT_TIMESTAMP
         WHERE user_id = ? AND used_at IS NULL`,
        [resetRecord.user_id]
      );

      if (tokenUpdate.affectedRows < 1) {
        await connection.rollback();
        transactionStarted = false;
        return res.status(400).json({
          success: false,
          message: "Reset link is invalid or expired.",
        });
      }

      await connection.commit();
      transactionStarted = false;
    } catch (transactionError) {
      if (transactionStarted) {
        await connection.rollback();
      }
      throw transactionError;
    } finally {
      connection.release();
    }

    return res.status(200).json({
      success: true,
      message: "Password reset successfully. Please log in again.",
      ...(normalizedNewEmail ? { email: normalizedNewEmail } : {}),
    });
  } catch (error) {
    console.error("Reset password error:", error.message);

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "That email address is already associated with an account.",
      });
    }

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
