import { chromium } from "playwright-core";
import { browserLocation, screenshotDirectory } from "./browser-utils.mjs";
import { join } from "node:path";

const base = process.argv[2] || "http://127.0.0.1:4177/";
const entry = process.argv[3] || "active-theory/frame.html";
const browser = await chromium.launch({ ...browserLocation(), headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1720, height: 1090 }, deviceScaleFactor: 1 });
const failures = [];
const errors = [];

page.on("requestfailed", (request) => failures.push(`${request.url()} — ${request.failure()?.errorText || "failed"}`));
page.on("response", (response) => {
  if (response.status() >= 400 && response.url().startsWith(base)) failures.push(`${response.status()} ${response.url()}`);
  const type = response.headers()["content-type"] || "";
  if (type.includes("text/html") && !response.url().endsWith("frame.html")) failures.push(`HTML fallback ${response.url()}`);
});
page.on("pageerror", (error) => errors.push(error.stack || error.message));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(`${message.text()} @ ${message.location().url}:${message.location().lineNumber}`);
});

try {
  await page.goto(new URL(entry, base).href, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(10_000);
  const canvas = page.locator("canvas");
  const result = {
    canvasCount: await canvas.count(),
    stageCount: await page.locator("#Stage").count(),
    bodyChildren: await page.locator("body > *").count(),
    projects: await page.evaluate(() => window.CMS_DATA?.projects?.map(({ title, perma, videoURL }) => ({ title, perma, videoURL })) || []),
    failures: [...new Set(failures)].slice(0, 80),
    errors: [...new Set(errors)].slice(0, 40),
  };
  await page.screenshot({ path: join(screenshotDirectory("active-theory-source-qa"), "source-frame.png") });
  await page.mouse.move(860, 545);
  for (let index = 0; index < 5; index += 1) {
    await page.mouse.wheel(0, 900);
    await page.waitForTimeout(700);
  }
  await page.waitForTimeout(2_000);
  await page.screenshot({ path: join(screenshotDirectory("active-theory-source-qa"), "source-work.png") });
  for (let index = 0; index < 8; index += 1) {
    await page.mouse.wheel(0, 900);
    await page.waitForTimeout(600);
  }
  await page.waitForTimeout(2_000);
  await page.screenshot({ path: join(screenshotDirectory("active-theory-source-qa"), "source-cards.png") });
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
