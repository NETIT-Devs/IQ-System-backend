
const db = require("../config/db");
const bcrypt = require("bcryptjs");
const { getPeriodCondition, normalizePeriod } = require("../utils/periodFilter");

// Find a user by email
async function findUserByEmail(email) {
  const [rows] = await db.execute(
    `SELECT user_id, full_name, email, password_hash, role, is_active
     FROM users
     WHERE email = ?
     LIMIT 1`,
    [email]
  );

  return rows[0] || null;
}

// Create a user
async function createUser(fullName, email, passwordHash, role) {
  const [result] = await db.execute(
    `INSERT INTO users
      (full_name, email, password_hash, role, is_active)
     VALUES (?, ?, ?, ?, 1)`,
    [fullName, email, passwordHash, role]
  );

  return result.insertId;
}

async function getAllUsers(requestedPeriod) {
  const period = requestedPeriod ? normalizePeriod(requestedPeriod) : null;
  if (requestedPeriod && !period) {
    throw new Error("Invalid period. Allowed: 1w, 1m, 3m, 1y, 2y.");
  }

  const periodCondition = period
    ? `WHERE ${getPeriodCondition("created_at", period)}`
    : "";
  const [rows] = await db.execute(
    `SELECT user_id, full_name, email, role, is_active, created_at
     FROM users
     ${periodCondition}
     ORDER BY user_id DESC`
  );

  return rows;
}

async function getUserById(userId) {
  const [rows] = await db.execute(
    `SELECT user_id, full_name, email, role, is_active
     FROM users
     WHERE user_id = ?
     LIMIT 1`,
    [userId]
  );

  return rows[0] || null;
}

async function updateAdmin(userId, fullName, email, passwordHash) {
  const values = [fullName, email];
  let passwordUpdate = "";

  if (passwordHash) {
    passwordUpdate = ", password_hash = ?";
    values.push(passwordHash);
  }

  values.push(userId);

  const [result] = await db.execute(
    `UPDATE users
     SET full_name = ?, email = ?${passwordUpdate}, updated_at = CURRENT_TIMESTAMP
     WHERE user_id = ? AND role = 'Admin'`,
    values
  );

  return result.affectedRows;
}

async function toggleAdminStatus(userId) {
  const [result] = await db.execute(
    `UPDATE users
     SET is_active = IF(is_active = 1, 0, 1),
         updated_at = CURRENT_TIMESTAMP
     WHERE user_id = ? AND role = 'Admin'`,
    [userId]
  );

  return result.affectedRows;
}

// Delete an Admin account only
async function deleteAdmin(userId) {
  const [result] = await db.execute(
    `DELETE FROM users
     WHERE user_id = ? AND role = 'Admin'`,
    [userId]
  );

  return result.affectedRows;
}

async function mergeUserAccount({
  sourceUserId,
  recipientUserId,
  actorUserId,
  password,
  recipientEmail,
}) {
  const accountIds = [sourceUserId, recipientUserId, actorUserId].map(Number);
  if (
    accountIds.some((userId) => !Number.isInteger(userId) || userId <= 0) ||
    Number(sourceUserId) === Number(recipientUserId) ||
    typeof password !== "string" ||
    !password ||
    typeof recipientEmail !== "string" ||
    !recipientEmail.trim()
  ) {
    const error = new Error("Valid source, recipient, and authorization details are required.");
    error.code = "INVALID_MERGE_REQUEST";
    throw error;
  }

  const connection = await db.getConnection();
  let transactionStarted = false;

  try {
    await connection.beginTransaction();
    transactionStarted = true;

    const uniqueAccountIds = [...new Set(accountIds)];
    const [users] = await connection.execute(
      `SELECT user_id, full_name, email, password_hash, role, is_active
       FROM users
       WHERE user_id IN (${uniqueAccountIds.map(() => "?").join(", ")})
       ORDER BY user_id
       FOR UPDATE`,
      uniqueAccountIds
    );
    const sourceUser = users.find(
      (user) => Number(user.user_id) === Number(sourceUserId)
    );
    const recipient = users.find(
      (user) => Number(user.user_id) === Number(recipientUserId)
    );
    const actor = users.find(
      (user) => Number(user.user_id) === Number(actorUserId)
    );

    if (
      !actor ||
      actor.role !== "Super Admin" ||
      Number(actor.is_active) !== 1
    ) {
      const error = new Error("An active Super Admin account is required.");
      error.code = "MERGE_ACTOR_INVALID";
      throw error;
    }

    const authorized = actor.password_hash
      ? await bcrypt.compare(password, actor.password_hash)
      : false;
    if (!authorized) {
      const error = new Error("The Super Admin password is incorrect.");
      error.code = "INVALID_SUPER_ADMIN_PASSWORD";
      throw error;
    }

    if (
      !sourceUser ||
      Number(sourceUser.is_active) !== 1 ||
      !["Admin", "Super Admin"].includes(sourceUser.role)
    ) {
      const error = new Error("The source account must be active.");
      error.code = "SOURCE_ACCOUNT_INVALID";
      throw error;
    }

    if (
      !recipient ||
      Number(recipient.is_active) !== 1 ||
      !["Admin", "Super Admin"].includes(recipient.role)
    ) {
      const error = new Error("The recipient account must be an active administrator.");
      error.code = "RECIPIENT_ACCOUNT_INVALID";
      throw error;
    }

    if (
      String(recipient.email || "").trim().toLowerCase() !==
      recipientEmail.trim().toLowerCase()
    ) {
      const error = new Error("Recipient email does not match the selected account.");
      error.code = "RECIPIENT_EMAIL_MISMATCH";
      throw error;
    }

    const mergedRecords = {};
    const ownershipTransfers = [
      ["customers", "created_by"],
      ["quotations", "created_by"],
      ["invoices", "created_by"],
      ["payments", "received_by"],
      ["quotation_topics", "created_by"],
      ["notifications", "user_id"],
    ];

    for (const [table, ownerColumn] of ownershipTransfers) {
      const [result] = await connection.execute(
        `UPDATE ${table}
         SET ${ownerColumn} = ?
         WHERE ${ownerColumn} = ?`,
        [recipientUserId, sourceUserId]
      );
      mergedRecords[table] = result.affectedRows;
    }

    const [resetTokens] = await connection.execute(
      `DELETE FROM password_reset_tokens
       WHERE user_id = ?`,
      [sourceUserId]
    );

    if (sourceUser.role === "Super Admin" && recipient.role !== "Super Admin") {
      await connection.execute(
        `UPDATE users
         SET role = 'Super Admin', updated_at = CURRENT_TIMESTAMP
         WHERE user_id = ? AND role = 'Admin' AND is_active = 1`,
        [recipientUserId]
      );
    }

    await connection.execute(
      `UPDATE users
       SET role = 'Admin', is_active = 0, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = ? AND is_active = 1`,
      [sourceUserId]
    );

    await connection.execute(
      `INSERT INTO audit_logs
        (user_id, user_name, user_role, action, record_id, details)
       VALUES (?, ?, 'Super Admin', ?, ?, ?)`,
      [
        actorUserId,
        actor.full_name || actor.email,
        "User Account Merged and Deactivated",
        sourceUserId,
        `Merged account ${sourceUser.full_name || sourceUser.email} (User ID ${sourceUserId}) into ${recipient.full_name || recipient.email} (User ID ${recipientUserId}); source account deactivated. Audit history retained.`,
      ]
    );

    await connection.commit();
    transactionStarted = false;

    return {
      source_user: {
        user_id: Number(sourceUser.user_id),
        full_name: sourceUser.full_name,
        email: sourceUser.email,
        is_active: false,
      },
      recipient: {
        user_id: Number(recipient.user_id),
        full_name: recipient.full_name,
        email: recipient.email,
        role:
          sourceUser.role === "Super Admin" ? "Super Admin" : recipient.role,
        is_active: true,
      },
      merged_records: mergedRecords,
      reset_tokens_deleted: resetTokens.affectedRows,
      is_self_transfer: Number(sourceUserId) === Number(actorUserId),
    };
  } catch (error) {
    if (transactionStarted) {
      await connection.rollback();
    }
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  findUserByEmail,
  createUser,
  getAllUsers,
  getUserById,
  updateAdmin,
  toggleAdminStatus,
  deleteAdmin,
  mergeUserAccount,
};
