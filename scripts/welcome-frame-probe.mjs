// 守护者相位逐帧取景：用 __lumoraSeek 把渲染时间轴钉在指定秒截图，供人工检查水母形态
import { mkdtemp } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { browserLocation, screenshotDirectory } from "./browser-utils.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = screenshotDirectory("lumora-jelly-probe");
const server = spawn(process.execPath, ["server.mjs"], {
  cwd: root, env: { ...process.env, PORT: "0", LUMORA_USER_DATA: join(await mkdtemp(join(tmpdir(), "lumora-jelly-probe-")), "users.json") },
  stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
});
let browser;
try {
  const base = await new Promise((resolve, reject) => {
    let logs = "";
    const timer = setTimeout(() => reject(new Error(`Server start timeout: ${logs}`)), 12000);
    server.once("error", (e) => { clearTimeout(timer); reject(e); });
    server.once("exit", (code) => { clearTimeout(timer); reject(new Error(`Server exit ${code}: ${logs}`)); });
    server.stderr.on("data", (chunk) => { logs += chunk; });
    server.stdout.on("data", (chunk) => {
      logs += chunk;
      const match = logs.match(/http:\/\/localhost:(\d+)/);
      if (match) { clearTimeout(timer); resolve(`http://localhost:${match[1]}/`); }
    });
  });
  browser = await chromium.launch({ ...browserLocation(), headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.route("**/*", (route) => route.request().url().startsWith(base) ? route.continue() : route.abort());
  const page = await context.newPage();
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.locator(".wc-canvas").waitFor();
  await page.waitForTimeout(1700); // 等开场时间轴把画布淡入到位，避免取景帧透出底层应用
  for (const t of [4.6, 5.4, 6.0, 6.35, 6.9]) {
    await page.evaluate((value) => window.__lumoraSeek?.(value), t);
    await page.waitForTimeout(60);
    await page.screenshot({ path: join(output, `jelly-t${t}.png`) });
  }
  console.log(JSON.stringify({ artifacts: output }));
  await context.close();
} finally {
  try { await browser?.close(); } finally { server.kill(); }
}
