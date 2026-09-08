// 答辩 PPT 素材：欢迎页六幕分镜 1920×1080 截图
// 画布场景（雾醒/密文雨/水母）用 __lumoraSeek 钉住时间轴逐帧取景，确定性不受启动抖动影响；
// DOM 动效场景（拼贴/标题/飞入）按真实时间轴墙钟截图。改完 src 先 npm run build 再跑本脚本。
import { mkdtemp } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { browserLocation } from "./browser-utils.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = join(root, "docs", "ppt素材", "欢迎页开场");
const server = spawn(process.execPath, ["server.mjs"], {
  cwd: root, env: { ...process.env, PORT: "0", LUMORA_USER_DATA: join(await mkdtemp(join(tmpdir(), "lumora-ppt-shots-")), "users.json") },
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
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  await context.route("**/*", (route) => route.request().url().startsWith(base) ? route.continue() : route.abort());
  const page = await context.newPage();
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.locator(".wc-canvas").waitFor();
  const t0 = Date.now();

  // 第一阶段：画布场景（seek 钉帧）。等 1.7s 让开场时间轴把画布淡入到位
  await page.waitForTimeout(1700);
  const canvasScenes = [
    [0.9, "01-雾醒"],
    [3.0, "02-极光密文雨"],
    [5.3, "03-水母推近"],
    [6.15, "04-水母守护者特写"],
  ];
  for (const [t, name] of canvasScenes) {
    await page.evaluate((value) => window.__lumoraSeek?.(value), t);
    await page.waitForTimeout(80);
    await page.screenshot({ path: join(output, `${name}.png`) });
  }
  // 恢复实时时钟，随后按墙钟截 DOM 动效场景（时间从 t0 起算，seek 期间 GSAP 照常播放）
  await page.evaluate(() => window.__lumoraSeek?.(-1));
  const wallScenes = [
    [7300, "05-拼贴彗尾飞入"], // 卡在格子飞行中途，彗尾拖影可见
    [9100, "06-拼贴合拢金闪"],
    [10200, "07-解密标题"],
    [11400, "08-飞入主页面"],
  ];
  for (const [at, name] of wallScenes) {
    await page.waitForTimeout(Math.max(0, at - (Date.now() - t0)));
    await page.screenshot({ path: join(output, `${name}.png`) });
  }
  console.log(JSON.stringify({ artifacts: output, count: canvasScenes.length + wallScenes.length }));
  await context.close();
} finally {
  try { await browser?.close(); } finally { server.kill(); }
}
