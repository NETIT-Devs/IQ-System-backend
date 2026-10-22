require("dotenv").config();

const bcrypt = require("bcryptjs");
const db = require("./config/db");

async function main() {
  try {
    const fullName = process.env.SUPERADMIN_NAME;
    const email = process.env.SUPERADMIN_EMAIL;
    const password = process.env.SUPERADMIN_PASSWORD;

    if (!fullName || !email || !password || password.length < 12) {
      throw new Error("Required details are missing or password is too short.");
    }

    const [existing] = await db.execute(
      "SELECT user_id FROM users WHERE email = ? LIMIT 1",
      [email]
    );

    if (existing.length > 0) {
      throw new Error("This email already exists. No account was created.");
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const [result] = await db.execute(
      `INSERT INTO users
       (full_name, email, password_hash, role, is_active)
       VALUES (?, ?, ?, 'Super Admin', 1)`,
      [fullName, email, passwordHash]
    );

    console.log("Super Admin account created successfully.");
    console.log("User ID:", result.insertId);
    console.log("Email:", email);
    console.log("Role: Super Admin");
  } catch (error) {
    console.error("Account creation failed:", error.message);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
}

main();