import { chromium } from "playwright-core";
import { browserLocation, screenshotDirectory } from "./browser-utils.mjs";

const base = process.argv[2] || "http://127.0.0.1:4173/";
const screenshotDir = screenshotDirectory("lumora-innovation-qa");

const browser = await chromium.launch({ ...browserLocation(), headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on("console", (message) => {
  if (message.type() !== "error") return;
  const source = message.location().url;
  if (source && new URL(source).origin !== new URL(base).origin) return;
  if (source.endsWith("/favicon.ico")) return;
  if (source.includes("/api/agent/status") || source.includes("/api/agent/conversations")) return;
  errors.push(`${message.text()} @ ${source}`);
});
page.on("pageerror", (error) => errors.push(error.message));

const results = {};
try {
  await page.goto(`${base}#innovation`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "AI 智能导师" }).waitFor();

  results.route = page.url().endsWith("#innovation");
  results.title = await page.getByRole("heading", { name: "AI 智能导师" }).isVisible();
  results.caustics = await page.locator(".innovation-caustics").count() === 2;
  results.bubbles = await page.locator(".innovation-bubble").count() === 24;
  results.jellyfish = await page.locator(".ocean-jellyfish").count() === 6;
  results.glass = await page.locator(".innovation-main-panel").evaluate((element) => {
    const style = getComputedStyle(element);
    const backdrop = style.getPropertyValue("backdrop-filter") || style.getPropertyValue("-webkit-backdrop-filter");
    return {
      applied: backdrop !== "none" && backdrop !== "" && Number.parseFloat(style.borderRadius) >= 30,
      backdrop,
      borderRadius: style.borderRadius,
    };
  });

  await page.waitForTimeout(250);
  const firstJelly = page.locator(".ocean-jellyfish").first();
  const transformBeforeCruise = await firstJelly.evaluate((element) => element.style.transform);
  await page.waitForTimeout(600);
  const transformAfterCruise = await firstJelly.evaluate((element) => element.style.transform);
  results.randomCruise = transformBeforeCruise !== transformAfterCruise;

  const beforeEscape = await firstJelly.boundingBox();
  if (!beforeEscape) throw new Error("First jellyfish has no bounding box");
  await page.mouse.move(beforeEscape.x + beforeEscape.width / 2 + 46, beforeEscape.y + beforeEscape.height / 2, { steps: 3 });
  await page.waitForTimeout(520);
  const afterEscape = await firstJelly.boundingBox();
  if (!afterEscape) throw new Error("First jellyfish disappeared during escape test");
  const beforeCenter = { x: beforeEscape.x + beforeEscape.width / 2, y: beforeEscape.y + beforeEscape.height / 2 };
  const afterCenter = { x: afterEscape.x + afterEscape.width / 2, y: afterEscape.y + afterEscape.height / 2 };
  const escapeDistance = Math.hypot(afterCenter.x - beforeCenter.x, afterCenter.y - beforeCenter.y);
  results.mouseEscape = escapeDistance > 12 && afterCenter.x < beforeCenter.x;

  results.homeEntryCount = await page.getByRole("button", { name: "返回 Lumora 首页", exact: true }).count();
  results.agentEntryCount = await page.getByRole("button", { name: "进入 AI 导师", exact: true }).count();
  results.imageEntryCount = await page.getByRole("button", { name: "进入图片实验", exact: true }).count();
  results.removedDeadNavigation = await page.getByRole("button", { name: /^(功能|关于|联系|进入|启动智能导师)$/ }).count() === 0;

  results.desktopOverflow = await page.evaluate(() => ({
    horizontal: document.documentElement.scrollWidth > innerWidth,
    vertical: document.documentElement.scrollHeight > innerHeight,
  }));
  await page.screenshot({ path: `${screenshotDir}/innovation-desktop.png`, animations: "disabled" });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(180);
  results.mobileTitle = await page.getByRole("heading", { name: "AI 智能导师" }).isVisible();
  results.mobileAgentEntry = await page.getByRole("button", { name: "进入 AI 导师", exact: true }).isVisible();
  results.mobileImageEntry = await page.getByRole("button", { name: "进入图片实验", exact: true }).isVisible();
  results.mobileOverflow = await page.evaluate(() => ({
    horizontal: document.documentElement.scrollWidth > innerWidth,
    vertical: document.documentElement.scrollHeight > innerHeight,
  }));
  await page.screenshot({ path: `${screenshotDir}/innovation-mobile.png`, animations: "disabled" });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${base}#innovation`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "进入 AI 导师", exact: true }).click({ force: true });
  await page.waitForTimeout(500);
  results.agentRoute = page.url().endsWith("#agent") || page.url().endsWith("#login");
  await page.goto(`${base}#agent`, { waitUntil: "domcontentloaded" });
  results.agentShowcaseFirst = await page.getByText("SCROLL TO EXPLORE", { exact: true }).isVisible();
  results.agentDialogHiddenInitially = await page.getByRole("button", { name: "进入 Agent 对话", exact: true }).count() === 0;

  await page.goto(`${base}#innovation`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "进入图片实验", exact: true }).click({ force: true });
  await page.waitForTimeout(500);
  results.imageRoute = page.url().endsWith("#ocean");

  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.locator('nav[aria-label="主导航"]').getByRole("button", { name: "AI 创新", exact: true }).click();
  await page.getByRole("heading", { name: "AI 智能导师" }).waitFor();
  results.homeEntry = page.url().endsWith("#innovation");
  results.homeMusicContinues = await page.locator('audio[src="/assets/komorebi.mp3"]').evaluate((media) => !media.paused);
  results.frameTiming = await page.evaluate(() => new Promise((resolve) => {
    const samples = [];
    let previous = performance.now();
    const sample = (time) => {
      samples.push(time - previous);
      previous = time;
      if (samples.length < 72) requestAnimationFrame(sample);
      else {
        const sorted = [...samples].sort((a, b) => a - b);
        resolve({
          average: samples.reduce((sum, value) => sum + value, 0) / samples.length,
          p95: sorted[Math.floor(sorted.length * 0.95)],
        });
      }
    };
    requestAnimationFrame(sample);
  }));

  results.noRuntimeErrors = errors.length === 0;
} finally {
  await browser.close();
}

const booleans = [
  results.route,
  results.title,
  results.caustics,
  results.bubbles,
  results.jellyfish,
  results.glass?.applied,
  results.mouseEscape,
  results.homeEntryCount === 1,
  results.agentEntryCount === 1,
  results.imageEntryCount === 1,
  results.removedDeadNavigation,
  results.mobileTitle,
  results.mobileAgentEntry,
  results.mobileImageEntry,
  !results.desktopOverflow?.horizontal,
  !results.desktopOverflow?.vertical,
  !results.mobileOverflow?.horizontal,
  results.agentRoute,
  results.agentShowcaseFirst,
  results.agentDialogHiddenInitially,
  results.imageRoute,
  results.homeEntry,
  results.homeMusicContinues,
  results.noRuntimeErrors,
];
console.log(JSON.stringify({ ok: booleans.every(Boolean), results, errors, screenshotDir }, null, 2));
if (!booleans.every(Boolean)) process.exitCode = 1;
