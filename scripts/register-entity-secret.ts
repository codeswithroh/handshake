/**
 * One-time entity secret registration for Circle developer-controlled wallets.
 * Run: bun run scripts/register-entity-secret.ts
 * Never commit this script's output or the .env file.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { registerEntitySecretCiphertext } from "@circle-fin/developer-controlled-wallets";

async function main() {
  const apiKey = process.env.CIRCLE_API_KEY;
  if (!apiKey) throw new Error("CIRCLE_API_KEY not set in environment");

  // Generate secret without printing it
  const entitySecret = crypto.randomBytes(32).toString("hex");

  // Ensure recovery dir exists under /home/user/app so the user can download it
  const recoveryDir = "/home/user/app/.circle";
  fs.mkdirSync(recoveryDir, { recursive: true });

  console.log("Registering entity secret ciphertext with Circle...");
  const response = await registerEntitySecretCiphertext({
    apiKey,
    entitySecret,
    recoveryFileDownloadPath: recoveryDir,
  });

  // Write recovery file explicitly in case SDK didn't persist it
  const recoveryPath = path.join(recoveryDir, "recovery_file.dat");
  if (response.data?.recoveryFile) {
    fs.writeFileSync(recoveryPath, response.data.recoveryFile, "utf-8");
  }
  if (!fs.existsSync(recoveryPath)) {
    throw new Error("Recovery file was not written — registration may have failed");
  }

  // Persist secret to .env (append, never print value)
  const envPath = "/home/user/app/.env";
  const envContent = fs.readFileSync(envPath, "utf-8");
  if (!envContent.includes("CIRCLE_ENTITY_SECRET=")) {
    fs.appendFileSync(envPath, `\nCIRCLE_ENTITY_SECRET=${entitySecret}\n`, "utf-8");
  }

  console.log("Registration complete.");
  console.log("Recovery file written to: .circle/recovery_file.dat");
  console.log("CIRCLE_ENTITY_SECRET appended to .env");
  console.log("");
  console.log("=== ACTION REQUIRED ===");
  console.log("Back up BOTH of these before proceeding:");
  console.log("  1. CIRCLE_ENTITY_SECRET value from .env (store in a password manager)");
  console.log("  2. .circle/recovery_file.dat (download from the Code panel file tree)");
  console.log("Losing either one means PERMANENT loss of access to all wallets.");
}

main().catch((e: unknown) => {
  const msg = e instanceof Error ? e.message : String(e)
  console.error("Registration failed:", msg);
  process.exit(1);
});
