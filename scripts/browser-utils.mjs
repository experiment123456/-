import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

export function browserLocation() {
  return process.env.LUMORA_BROWSER_PATH
    ? { executablePath: process.env.LUMORA_BROWSER_PATH }
    : { channel: process.env.LUMORA_BROWSER_CHANNEL || "chrome" };
}

export function screenshotDirectory(name) {
  const directory = join(process.env.LUMORA_QA_DIR || tmpdir(), name);
  mkdirSync(directory, { recursive: true });
  return directory;
}
