require("dotenv").config();

const readline = require("readline");
const bcrypt = require("bcryptjs");
const db = require("./config/db");
const { spawnSync } = require("child_process");

function ask(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  try {
    const fullName = await ask("Super Admin full name: ");
    const email = (await ask("Super Admin email: ")).toLowerCase();

    const psScript =
      "$secure = Read-Host 'Create password (hidden)' -AsSecureString; " +
      "$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure); " +
      "try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) } " +
      "finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }";

    const result = spawnSync("powershell.exe", [
      "-NoProfile",
      "-Command",
      psScript,
    ], {
      encoding: "utf8",
      stdio: ["inherit", "pipe", "inherit"],
      windowsHide: false,
    });

    if (result.error || result.status !== 0) {
      throw new Error("Password prompt failed.");
    }

    const password = result.stdout.trim();

    if (!fullName || !email || password.length < 12) {
      console.log("Enter a name, valid email, and password of at least 12 characters.");
      return;
    }

    const [rows] = await db.execute(
      "SELECT user_id FROM users WHERE email = ? LIMIT 1",
      [email]
    );

    if (rows.length) {
      console.log("This email already exists. No account created.");
      return;
    }

    const hash = await bcrypt.hash(password, 12);

    const [insert] = await db.execute(
      `INSERT INTO users
       (full_name, email, password_hash, role, is_active)
       VALUES (?, ?, ?, 'Super Admin', 1)`,
      [fullName, email, hash]
    );

    console.log("Super Admin account created successfully.");
    console.log("User ID:", insert.insertId);
    console.log("Email:", email);
    console.log("Role: Super Admin");
  } catch (err) {
    console.error("Account creation failed:", err.message);
  } finally {
    await db.end();
  }
}

main();