
const db = require("../config/db");

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

module.exports = {
  findUserByEmail,
};
