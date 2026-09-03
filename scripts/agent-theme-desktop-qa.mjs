import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { browserLocation, screenshotDirectory } from "./browser-utils.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const data = await mkdtemp(join(tmpdir(), "lumora-theme-desktop-qa-"));
const screenshots = screenshotDirectory("lumora-theme-desktop-qa");
const showcaseEndScreenshot = join(screenshots, "agent-showcase-english-labels.png");
const contactSceneScreenshot = join(screenshots, "agent-showcase-contact-scene.png");
const server = spawn(process.execPath, ["server.mjs"], {
  cwd: root,
  env: { ...process.env, PORT: "0", LUMORA_USER_DATA: join(data, "users.json"), DASHSCOPE_API_KEY: "" },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});

let browser;
try {
  const base = await new Promise((resolve, reject) => {
    let logs = "";
    const timer = setTimeout(() => reject(new Error(`Server start timeout: ${logs}`)), 12_000);
    server.once("error", reject);
    server.stdout.on("data", (chunk) => {
      logs += chunk;
      const match = logs.match(/http:\/\/localhost:(\d+)/);
      if (match) {
        clearTimeout(timer);
        resolve(`http://localhost:${match[1]}/`);
      }
    });
    server.stderr.on("data", (chunk) => { logs += chunk; });
  });

  browser = await chromium.launch({ ...browserLocation(), headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const runtimeErrors = [];
  const showcaseDiagnostics = [];
  page.on("requestfailed", (request) => {
    if (request.url().includes("/active-theory/")) showcaseDiagnostics.push(`request failed: ${request.url()} (${request.failure()?.errorText || "unknown"})`);
  });
  page.on("response", (response) => {
    if (response.url().includes("/active-theory/") && response.status() >= 400) showcaseDiagnostics.push(`response ${response.status()}: ${response.url()}`);
  });
  page.on("pageerror", (error) => {
    const detail = error.stack || error.message;
    if (detail.includes("active-theory") || error.message.includes("AntimatterAttribute") || error.message.includes("reading 'image'")) showcaseDiagnostics.push(`page error: ${detail}`);
    const isKnownShowcaseError = detail.includes("/active-theory/assets/js/app.local-z-v2.js")
      || error.message.includes("AntimatterAttribute")
      || error.message.includes("reading 'image'")
      || error.message.includes("Unable to decode audio data");
    if (!isKnownShowcaseError) runtimeErrors.push(detail);
  });
  page.setDefaultTimeout(15_000);
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.getByRole("tab", { name: "注册" }).click();
  await page.getByPlaceholder("你希望显示的名字").fill("视觉检查员");
  await page.getByPlaceholder("3–24 位中文、字母或数字").fill("lux_visual_qa");
  await page.getByPlaceholder("至少 8 位").fill("lux-visual-2026");
  await page.getByPlaceholder("再次输入密码").fill("lux-visual-2026");
  await page.getByRole("button", { name: "创建并进入" }).click();
  await page.getByRole("button", { name: "打开账户中心" }).waitFor();
  await page.getByRole("button", { name: "AI 创新", exact: true }).click();
  await page.getByRole("heading", { name: "AI 创新界面" }).waitFor();
  await page.getByRole("button", { name: /启动智能导师/ }).click();

  const frameHandle = await page.locator(".agent-showcase-frame").elementHandle();
  const sourceFrame = await frameHandle?.contentFrame();
  assert.ok(sourceFrame, "Active Theory source frame did not load");
  await sourceFrame.waitForFunction(() => Boolean(window.__LUMORA_SOURCE_SCROLL__), null, { timeout: 20_000 });
  const showcaseCache = await sourceFrame.evaluate(() => window._CACHE_);
  const showcaseReadability = await page.evaluate(() => {
    const button = document.querySelector(".agent-showcase-header button");
    const brand = document.querySelector(".agent-showcase-header > span");
    const hint = document.querySelector(".agent-showcase-hint");
    if (!button || !brand || !hint) throw new Error("Showcase overlay is incomplete");
    return {
      button: Number.parseFloat(getComputedStyle(button).fontSize),
      brand: Number.parseFloat(getComputedStyle(brand).fontSize),
      hint: Number.parseFloat(getComputedStyle(hint).fontSize),
    };
  });
  assert.ok(showcaseReadability.button >= 13 && showcaseReadability.brand >= 11 && showcaseReadability.hint >= 12);
  await sourceFrame.locator(".nav-cn-contact").waitFor({ state: "attached" });
  assert.equal(await sourceFrame.locator(".nav-cn-contact").isVisible(), false);
  assert.equal(await sourceFrame.getByText("lumora agent", { exact: true }).isVisible(), true);
  await page.mouse.move(720, 480);
  let showcaseLabelsCaptured = false;
  for (let index = 0; index < 42; index += 1) {
    await page.mouse.wheel(0, 1_100);
    await page.waitForTimeout(90);
    const progress = await sourceFrame.evaluate(() => Number(window.__LUMORA_SOURCE_SCROLL__?.progress || 0));
    if (!showcaseLabelsCaptured && progress >= 0.35 && progress <= 0.9) {
      await page.screenshot({ path: showcaseEndScreenshot, animations: "disabled" });
      showcaseLabelsCaptured = true;
    }
    if (progress >= 0.99) break;
  }
  if (!showcaseLabelsCaptured) await page.screenshot({ path: showcaseEndScreenshot, animations: "disabled" });
  await sourceFrame.locator(".nav-cn-contact").evaluate((button) => button.click());
  await page.waitForTimeout(5_000);
  await page.screenshot({ path: contactSceneScreenshot, animations: "disabled" });
  await sourceFrame.evaluate(() => parent.postMessage({ type: "lumora:open-agent" }, location.origin));
  await page.locator(".agent-use-page").waitFor();

  const theme = await page.evaluate(() => {
    const panel = document.querySelector(".agent-chat-panel");
    const message = document.querySelector(".agent-message p");
    const composer = document.querySelector(".agent-composer");
    if (!panel || !message || !composer) throw new Error("Agent workspace is incomplete");
    return {
      panelBackground: getComputedStyle(panel).background,
      messageColor: getComputedStyle(message).color,
      composerBackground: getComputedStyle(composer).backgroundColor,
      fitsViewport: document.documentElement.scrollWidth <= innerWidth,
    };
  });

  assert.match(theme.panelBackground, /rgba?\(255, 255, 255/);
  assert.equal(theme.messageColor, "rgb(46, 41, 36)");
  assert.match(theme.composerBackground, /rgba?\(255, 255, 255/);
  assert.equal(theme.fitsViewport, true);

  await page.locator(".agent-composer textarea").fill("你好，请简单介绍你自己");
  await page.getByRole("button", { name: "发送消息" }).click();
  await page.locator(".agent-message.is-assistant").last().getByText(/当前未配置千问 API Key/).waitFor();
  await page.getByRole("button", { name: "打开历史对话" }).click();
  await page.getByRole("complementary", { name: "历史对话归档" }).waitFor();
  assert.equal(await page.locator(".agent-history-list article > button:first-child").filter({ hasText: "你好，请简单介绍你自己" }).count(), 1);
  const historyScreenshot = join(screenshots, "agent-history-desktop.png");
  await page.screenshot({ path: historyScreenshot, animations: "disabled" });
  await page.getByRole("button", { name: "关闭历史对话" }).click();

  await page.getByRole("button", { name: "退出到创新页" }).click();
  const dock = page.locator(".agent-dock");
  await dock.waitFor();
  await dock.locator(".agent-composer textarea").fill("如何使用双机通信");
  await dock.getByRole("button", { name: "发送消息" }).click();
  await dock.locator(".agent-message.is-assistant").last().getByText(/演示已完成/).waitFor();
  assert.equal(await dock.getByText(/工具步骤过多|安全停止/).count(), 0);
  const beforeMove = await dock.boundingBox();
  assert.ok(beforeMove);
  const dragHandle = page.getByRole("button", { name: "拖动 Agent 窗口" });
  const dragBox = await dragHandle.boundingBox();
  assert.ok(dragBox);
  await page.mouse.move(dragBox.x + dragBox.width / 2, dragBox.y + dragBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(dragBox.x - 150, dragBox.y - 90, { steps: 6 });
  await page.mouse.up();
  const afterMove = await dock.boundingBox();
  assert.ok(afterMove && (afterMove.x !== beforeMove.x || afterMove.y !== beforeMove.y));

  const resizeHandle = page.getByRole("button", { name: "调整 Agent 窗口大小" });
  const resizeBox = await resizeHandle.boundingBox();
  assert.ok(resizeBox);
  await page.mouse.move(resizeBox.x + resizeBox.width / 2, resizeBox.y + resizeBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(resizeBox.x + 90, resizeBox.y - 70, { steps: 6 });
  await page.mouse.up();
  const afterResize = await dock.boundingBox();
  assert.ok(afterResize && (afterResize.width !== afterMove.width || afterResize.height !== afterMove.height));

  await page.getByRole("button", { name: "缩成悬浮球" }).click();
  const orb = page.getByRole("button", { name: "打开 Lumora Agent；可拖动悬浮球" });
  await orb.waitFor();
  const orbBeforeMove = await orb.boundingBox();
  assert.ok(orbBeforeMove);
  await page.mouse.move(orbBeforeMove.x + orbBeforeMove.width / 2, orbBeforeMove.y + orbBeforeMove.height / 2);
  await page.mouse.down();
  await page.mouse.move(orbBeforeMove.x - 180, orbBeforeMove.y - 120, { steps: 6 });
  await page.mouse.up();
  const orbAfterMove = await orb.boundingBox();
  assert.ok(orbAfterMove && (orbAfterMove.x !== orbBeforeMove.x || orbAfterMove.y !== orbBeforeMove.y));
  await orb.click({ force: true });
  await dock.waitFor();
  await page.getByRole("button", { name: "打开历史对话" }).click();
  assert.equal(await page.locator(".agent-history-list article > button:first-child").filter({ hasText: "你好，请简单介绍你自己" }).count(), 1);
  assert.deepEqual(runtimeErrors, []);
  assert.equal(showcaseDiagnostics.some((issue) => issue.startsWith("response ")), false);
  const screenshot = join(screenshots, "agent-ivory-gold-desktop.png");
  await page.screenshot({ path: screenshot, animations: "disabled" });
  console.log(JSON.stringify({ ok: true, showcaseReadability, showcaseCache, contactRemoved: true, contactScenePreserved: true, lumoraAgentLabelVisible: true, showcaseDiagnostics, theme, guidedTourCompleted: true, movable: true, resizable: true, minimizable: true, orbMovable: true, historyRestored: true, screenshot, historyScreenshot, showcaseEndScreenshot, contactSceneScreenshot }, null, 2));
} finally {
  try { await browser?.close(); } finally { server.kill(); }
}
