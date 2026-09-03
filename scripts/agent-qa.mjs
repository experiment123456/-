import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { browserLocation, screenshotDirectory } from "./browser-utils.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const data = await mkdtemp(join(tmpdir(), "lumora-agent-qa-"));
const screenshots = screenshotDirectory("lumora-agent-qa");
const server = spawn(process.execPath, ["server.mjs"], {
  cwd: root,
  env: { ...process.env, PORT: "0", LUMORA_USER_DATA: join(data, "users.json"), DASHSCOPE_API_KEY: "" },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});
let browser;
const results = {};
const errors = [];
const sourceErrors = [];
try {
  const base = await new Promise((resolve, reject) => {
    let logs = "";
    const timer = setTimeout(() => reject(new Error(`Server start timeout: ${logs}`)), 12_000);
    server.once("error", reject);
    server.stdout.on("data", (chunk) => {
      logs += chunk;
      const match = logs.match(/http:\/\/localhost:(\d+)/);
      if (match) { clearTimeout(timer); resolve(`http://localhost:${match[1]}/`); }
    });
    server.stderr.on("data", (chunk) => { logs += chunk; });
  });
  browser = await chromium.launch({ ...browserLocation(), headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  page.on("pageerror", (error) => {
    const detail = error.stack || error.message;
    if (detail.includes("/active-theory/assets/js/app.local-z-v2.js") && detail.includes("AntimatterAttribute")) sourceErrors.push(detail);
    else errors.push(detail);
  });
  page.on("console", (message) => {
    const source = message.location().url;
    if (message.type() === "error" && source.startsWith(base) && !source.endsWith("/favicon.ico")) errors.push(`${message.text()} @ ${source}`);
  });
  page.setDefaultTimeout(15_000);
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.getByRole("tab", { name: "注册" }).click();
  await page.getByPlaceholder("你希望显示的名字").fill("Agent 测试员");
  await page.getByPlaceholder("3–24 位中文、字母或数字").fill("agent_tester");
  await page.getByPlaceholder("至少 8 位").fill("agent-test-2026");
  await page.getByPlaceholder("再次输入密码").fill("agent-test-2026");
  await page.getByRole("button", { name: "创建并进入" }).click();
  await page.getByRole("button", { name: "打开账户中心" }).waitFor();

  await page.getByRole("button", { name: "AI 创新", exact: true }).click();
  await page.getByRole("heading", { name: "AI 创新界面" }).waitFor();
  results.innovationEntry = page.url().endsWith("#innovation");
  await page.getByRole("button", { name: "启动智能导师", exact: true }).click();
  await page.locator(".agent-showcase-frame").waitFor();
  results.studioRoute = page.url().endsWith("#agent");
  results.sourceShowcase = await page.locator(".agent-showcase-frame").isVisible();
  results.noChatOverlay = await page.locator(".agent-showcase-page .agent-chat-panel").count() === 0;
  results.noEarlyChatEntry = await page.getByRole("button", { name: "进入 Agent 对话", exact: true }).count() === 0;
  const sourceFrameHandle = await page.locator(".agent-showcase-frame").elementHandle();
  const sourceFrame = await sourceFrameHandle?.contentFrame();
  assert.ok(sourceFrame, "Active Theory source frame did not load");
  await sourceFrame.waitForFunction(() => Boolean(window.__LUMORA_SOURCE_SCROLL__), null, { timeout: 20_000 });
  await page.mouse.move(720, 480);
  for (let index = 0; index < 42; index += 1) {
    await page.mouse.wheel(0, 1_100);
    await page.waitForTimeout(90);
    const progress = await sourceFrame.evaluate(() => Number(window.__LUMORA_SOURCE_SCROLL__?.progress || 0));
    if (progress >= 0.99) break;
  }
  await page.getByRole("button", { name: "进入 Agent 对话", exact: true }).waitFor({ timeout: 10_000 });
  results.bottomChatEntry = await page.getByRole("button", { name: "进入 Agent 对话", exact: true }).isVisible();
  await page.screenshot({ path: join(screenshots, "agent-showcase-end.png"), animations: "disabled" });
  await page.getByRole("button", { name: "进入 Agent 对话", exact: true }).click();
  await page.locator(".agent-use-page").waitFor();
  results.staticWorkspace = await page.getByRole("heading", { name: "今天想探索什么？" }).isVisible();
  results.staticPrompts = await page.getByRole("button", { name: "带我演示 AES", exact: true }).isVisible()
    && await page.getByRole("button", { name: "讲解 DH 密钥交换", exact: true }).isVisible();
  results.mockStatus = await page.getByText("本地演示模式", { exact: true }).isVisible();
  await page.screenshot({ path: join(screenshots, "agent-studio.png"), animations: "disabled" });

  await page.getByRole("button", { name: "退出到创新页", exact: true }).click();
  await page.waitForURL((url) => url.hash === "#innovation");
  results.exitFloatingDock = await page.locator(".agent-dock").isVisible();
  await page.getByRole("button", { name: /返回 AI 空间/ }).click();
  await page.waitForURL((url) => url.hash === "#agent");

  await page.getByRole("button", { name: "讲解 DH 密钥交换", exact: true }).click();
  await page.waitForURL((url) => url.hash === "#dh");
  await page.getByText(/演示已经完成/).waitFor();
  results.toolNavigated = true;
  results.dhExecuted = await page.getByText(/交换成功/).isVisible();
  results.persistentDock = await page.locator(".agent-dock").isVisible();
  await page.screenshot({ path: join(screenshots, "agent-dh-dock.png"), animations: "disabled" });

  const completionCount = await page.getByText(/演示已经完成/).count();
  await page.getByRole("button", { name: "带我演示 AES", exact: true }).click();
  await page.waitForURL((url) => url.hash === "#workbench");
  await page.waitForFunction((before) => [...document.querySelectorAll("p")].filter((node) => node.textContent?.includes("演示已经完成")).length > before, completionCount);
  results.aesExecuted = await page.locator('[data-agent-id="workbench.output"]').evaluate((element) => element instanceof HTMLTextAreaElement && Boolean(element.value));

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".agent-dock-actions button").last().click();
  results.mobileOrb = await page.locator(".agent-dock-orb").isVisible();
  results.noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  results.noRuntimeErrors = errors.length === 0;
  assert.equal(Object.values(results).every(Boolean), true, JSON.stringify({ results, errors, sourceErrors }, null, 2));
  console.log(JSON.stringify({ ok: true, results, errors, sourceErrors, screenshots }, null, 2));
} finally {
  try { await browser?.close(); } finally { server.kill(); }
}
