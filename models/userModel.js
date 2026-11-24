
const db = require("../config/db");
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

async function transferSuperAdminAccess(currentSuperAdminId, targetAdminId) {
  const connection = await db.getConnection();
  let transactionStarted = false;

  try {
    await connection.beginTransaction();
    transactionStarted = true;

    const [users] = await connection.execute(
      `SELECT user_id, full_name, email, role, is_active
       FROM users
       WHERE user_id IN (?, ?)
       ORDER BY user_id
       FOR UPDATE`,
      [currentSuperAdminId, targetAdminId]
    );
    const currentSuperAdmin = users.find(
      (user) => Number(user.user_id) === Number(currentSuperAdminId)
    );
    const targetAdmin = users.find(
      (user) => Number(user.user_id) === Number(targetAdminId)
    );

    if (
      !currentSuperAdmin ||
      currentSuperAdmin.role !== "Super Admin" ||
      !currentSuperAdmin.is_active
    ) {
      const error = new Error("The current Super Admin account is not active.");
      error.code = "CURRENT_SUPER_ADMIN_INVALID";
      throw error;
    }

    if (!targetAdmin || targetAdmin.role !== "Admin" || !targetAdmin.is_active) {
      const error = new Error("The selected account must be an active Admin.");
      error.code = "TARGET_ADMIN_INVALID";
      throw error;
    }

    await connection.execute(
      `UPDATE users
       SET role = 'Super Admin', updated_at = CURRENT_TIMESTAMP
       WHERE user_id = ? AND role = 'Admin' AND is_active = 1`,
      [targetAdminId]
    );
    await connection.execute(
      `UPDATE users
       SET is_active = 0, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = ? AND role = 'Super Admin' AND is_active = 1`,
      [currentSuperAdminId]
    );

    await connection.execute(
      `INSERT INTO audit_logs
        (user_id, user_name, user_role, action, record_id, details)
       VALUES (?, ?, 'Super Admin', ?, ?, ?)`,
      [
        currentSuperAdminId,
        currentSuperAdmin.full_name || currentSuperAdmin.email,
        "Super Admin Access Transferred",
        targetAdminId,
        `Transferred Super Admin access to ${targetAdmin.full_name || targetAdmin.email} (User ID ${targetAdminId}); previous account deactivated.`,
      ]
    );

    await connection.commit();
    transactionStarted = false;

    return {
      user_id: Number(targetAdmin.user_id),
      full_name: targetAdmin.full_name,
      email: targetAdmin.email,
      role: "Super Admin",
      is_active: true,
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
  transferSuperAdminAccess,
};
