import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";

// Keep secrets server-side while allowing both npm scripts and start-local.cmd
// to use persistent configuration. Existing process variables always win.
for (const filename of [".env.local", ".env"]) {
  const path = fileURLToPath(new URL(filename, import.meta.url));
  if (existsSync(path)) loadEnvFile(path);
}
