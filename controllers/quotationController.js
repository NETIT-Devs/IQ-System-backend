
require("dotenv").config();

const readline = require("readline");
const bcrypt = require("bcryptjs");
const db = require("./config/db");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question) {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

async function createAdmin() {
  try {
    const fullName = (await ask("Admin full name: ")).trim();
    const email = (await ask("Admin email: ")).trim().toLowerCase();
    const password = await ask("Admin password: ");

    if (!fullName || !email || !password) {
      console.log("All fields are required.");
      return;
    }

    const [existing] = await db.execute(
      "SELECT user_id FROM users WHERE email = ? LIMIT 1",
      [email]
    );

    if (existing.length > 0) {
      console.log("This email already exists.");
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await db.execute(
      `INSERT INTO users
       (full_name, email, password_hash, role, is_active)
       VALUES (?, ?, ?, 'Admin', 1)`,
      [fullName, email, passwordHash]
    );

    console.log("Admin account created successfully!");
  } catch (error) {
    console.error("Error:", error.message);
  } finally {
    rl.close();
    await db.end();
  }
}

createAdmin();
