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
  errors.push(message.text());
});
page.on("pageerror", (error) => errors.push(error.message));

const results = {};
try {
  await page.goto(`${base}#innovation`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "待创新页面" }).waitFor();

  results.route = page.url().endsWith("#innovation");
  results.title = await page.getByRole("heading", { name: "待创新页面" }).isVisible();
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

  await page.getByRole("button", { name: "开始体验" }).click();
  results.experienceToggle = await page.getByRole("button", { name: "退出体验" }).isVisible()
    && await page.getByText("EXPLORING", { exact: true }).isVisible();
  await page.getByRole("button", { name: "组件", exact: true }).click();
  results.sectionInteraction = await page.getByText("MODULAR GLASS FIELD", { exact: true }).isVisible();

  results.desktopOverflow = await page.evaluate(() => ({
    horizontal: document.documentElement.scrollWidth > innerWidth,
    vertical: document.documentElement.scrollHeight > innerHeight,
  }));
  await page.screenshot({ path: `${screenshotDir}/innovation-desktop.png`, animations: "disabled" });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(180);
  results.mobileTitle = await page.getByRole("heading", { name: "待创新页面" }).isVisible();
  results.mobileOverflow = await page.evaluate(() => ({
    horizontal: document.documentElement.scrollWidth > innerWidth,
    vertical: document.documentElement.scrollHeight > innerHeight,
  }));
  await page.screenshot({ path: `${screenshotDir}/innovation-mobile.png`, animations: "disabled" });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.locator('nav[aria-label="主导航"]').getByRole("button", { name: "待创新", exact: true }).click();
  await page.getByRole("heading", { name: "待创新页面" }).waitFor();
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
  results.randomCruise,
  results.mouseEscape,
  results.experienceToggle,
  results.sectionInteraction,
  results.mobileTitle,
  !results.desktopOverflow?.horizontal,
  !results.desktopOverflow?.vertical,
  !results.mobileOverflow?.horizontal,
  !results.mobileOverflow?.vertical,
  results.homeEntry,
  results.homeMusicContinues,
  results.frameTiming?.average < 35,
  results.frameTiming?.p95 < 65,
  results.noRuntimeErrors,
];
console.log(JSON.stringify({ ok: booleans.every(Boolean), results, errors, screenshotDir }, null, 2));
