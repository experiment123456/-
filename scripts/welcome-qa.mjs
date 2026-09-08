import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { browserLocation, screenshotDirectory } from "./browser-utils.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = screenshotDirectory("lumora-welcome-qa");
const server = spawn(process.execPath, ["server.mjs"], {
  cwd: root, env: { ...process.env, PORT: "0", LUMORA_USER_DATA: join(await mkdtemp(join(tmpdir(), "lumora-welcome-qa-")), "users.json") },
  stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
});
let browser;
const results = {}, pageErrors = [];

// 采样开场画布：缩到 240x140 后统计亮度 > 24 的像素占比（"非空非纯黑"判定）
async function litRatio(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector(".wc-canvas");
    if (!canvas) return -1;
    const small = document.createElement("canvas");
    small.width = 240; small.height = 140;
    const sctx = small.getContext("2d");
    sctx.drawImage(canvas, 0, 0, small.width, small.height);
    const { data } = sctx.getImageData(0, 0, small.width, small.height);
    let lit = 0;
    for (let i = 0; i < data.length; i += 4) {
      const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      if (lum > 24) lit += 1;
    }
    return lit / (small.width * small.height);
  });
}

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

  async function pageAt(setup = async () => {}, contextOptions = {}) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, ...contextOptions });
    // 拦截全部外链（含云端视频）：QA 永远在"视频不可用"的最坏路径下验证兜底
    await context.route("**/*", (route) => route.request().url().startsWith(base) ? route.continue() : route.abort());
    await setup(context);
    const page = await context.newPage();
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.setDefaultTimeout(15000);
    await page.goto(base, { waitUntil: "domcontentloaded" });
    return page;
  }

  // ---- 页面 A：分帧采样 + 拼贴图就绪 + 自动飞入 ----
  const cine = await pageAt();
  await cine.locator(".wc-root").waitFor(); // 等 React 挂载，避免 isVisible 快照竞态
  results.overlayPresent = true;
  results.overlayZIndex = await cine.locator(".wc-root").evaluate((el) => getComputedStyle(el).zIndex);
  await cine.locator(".wc-canvas").waitFor(); // t0 对齐动画起点，首帧采样不再受冷启动影响
  const samples = [500, 2000, 5000, 6400, 7000, 9000, 10500]; // 6400ms 卡在守护者相位峰值（水母最大时）
  const t0 = Date.now();
  for (const at of samples) {
    await cine.waitForTimeout(Math.max(0, at - (Date.now() - t0)));
    const ratio = await litRatio(cine);
    results[`frame_${at}ms`] = Number(ratio.toFixed(4));
    assert.ok(ratio > 0.004, `frame at ${at}ms must show visible content, lit ratio ${ratio}`);
    await cine.screenshot({ path: join(output, `frame-${at}ms.png`) });
  }
  results.collageImages = await cine.evaluate(() =>
    Array.from(document.querySelectorAll(".wc-collage img")).map((img) => img.complete && img.naturalWidth > 0).filter(Boolean).length);
  assert.equal(results.collageImages, 8, "collage must render exactly 8 screenshot tiles");
  await cine.locator(".wc-root").waitFor({ state: "detached", timeout: 4500 }); // 11s 时间轴 + 退出动画
  results.autoEntersApp = true;
  await cine.context().close();

  // ---- 页面 B：点击跳过 ----
  const skip = await pageAt();
  await skip.waitForTimeout(1200);
  await skip.locator(".wc-root").click();
  await skip.locator(".wc-root").waitFor({ state: "detached", timeout: 1500 });
  results.clickSkips = true;
  await skip.context().close();

  // ---- 页面 C：prefers-reduced-motion 海报式 ----
  // 断言对象是 .wc-tile / .wc-core（海报路径 gsap.set 的目标），而非恒为 opacity 1 的 .wc-collage
  const reduced = await pageAt(undefined, { reducedMotion: "reduce" });
  await reduced.waitForTimeout(800);
  results.reducedMotionPoster = await reduced.locator(".wc-tile").first().evaluate((el) => getComputedStyle(el).opacity === "1")
    && await reduced.locator(".wc-core").evaluate((el) => getComputedStyle(el).opacity === "1");
  assert.equal(results.reducedMotionPoster, true, "reduced motion must show the poster collage immediately");
  await reduced.locator(".wc-root").waitFor({ state: "detached", timeout: 5000 });
  results.reducedMotionAutoEnters = true;
  await reduced.context().close();

  console.log(JSON.stringify({ results, pageErrors, artifacts: output }, null, 2));
  assert.equal(results.overlayPresent, true, "welcome cinematic overlay must be present on load");
  assert.equal(results.overlayZIndex, "60", "welcome overlay must sit above the app at z-index 60");
  assert.equal(results.autoEntersApp, true, "timeline must auto-dismiss into the app");
  assert.equal(results.clickSkips, true, "click must skip into the app");
  assert.equal(results.reducedMotionAutoEnters, true, "reduced-motion poster must auto-enter");
  assert.deepEqual(pageErrors, []);
} catch (error) {
  // 失败时也要吐出已收集的结果与截图目录，便于排障
  console.error(JSON.stringify({ results, pageErrors, artifacts: output }));
  throw error;
} finally {
  try { await browser?.close(); } finally { server.kill(); }
}
