
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
  deleteAdmin,
};
