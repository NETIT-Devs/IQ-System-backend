
const db = require("../config/db");

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

async function getAllUsers() {
  const [rows] = await db.execute(
    `SELECT user_id, full_name, email, role, is_active, created_at
     FROM users
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

module.exports = {
  findUserByEmail,
  createUser,
  getAllUsers,
  getUserById,
  updateAdmin,
  toggleAdminStatus,
  deleteAdmin,
};
