import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { browserLocation, screenshotDirectory } from "./browser-utils.mjs";

const data = await mkdtemp(join(tmpdir(), "lumora-pet-test-"));
const screenshots = screenshotDirectory("lumora-pet-qa");
const server = spawn(process.execPath, ["server.mjs"], {
  cwd: fileURLToPath(new URL("../", import.meta.url)),
  env: { ...process.env, PORT: "0", LUMORA_USER_DATA: join(data, "users.json"), DASHSCOPE_API_KEY: "" },
  stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
});
let browser;
const results = {};
try {
  const base = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Server startup timeout")), 12000);
    server.once("error", reject);
    server.stdout.on("data", (chunk) => {
      const match = String(chunk).match(/http:\/\/localhost:(\d+)/);
      if (match) { clearTimeout(timer); resolve(`http://localhost:${match[1]}`); }
    });
  });
  browser = await chromium.launch({ ...browserLocation(), headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const pet = page.locator(".pet-cat");
  const position = () => pet.boundingBox();
  const overlapFree = () => page.evaluate(() => {
    const pet = document.querySelector(".pet-cat").getBoundingClientRect();
    const selectors = ".agent-use-nav, .agent-use-workspace, .agent-use-footer, .agent-corner-gif, .agent-showcase-header, .agent-showcase-hint, .agent-showcase-bottom-entry";
    return pet.width > 0 && pet.left >= 0 && pet.top >= 0 && pet.right <= innerWidth && pet.bottom <= innerHeight && [...document.querySelectorAll(selectors)].every((element) => {
      const box = element.getBoundingClientRect();
      return !box.width || !box.height || pet.left >= box.right || pet.right <= box.left || pet.top >= box.bottom || pet.bottom <= box.top;
    });
  });
  await page.goto(`${base}/#agent`, { waitUntil: "domcontentloaded" });
  await pet.waitFor({ state: "visible" });
  await page.mouse.move(700, 400);
  const start = await position();
  await page.waitForTimeout(4500);
  let walked = await position();
  results.autoWalk = Math.hypot(walked.x - start.x, walked.y - start.y) > 4;
  assert.ok(results.autoWalk, "Cat should walk automatically");
  await page.waitForTimeout(8500);
  results.scrollHint = await page.locator(".pet-cat-speech").isVisible()
    && (await page.locator(".pet-cat-speech").textContent()).includes("往下滑");
  walked = await position();
  await page.mouse.move(walked.x + 40, walked.y + 60);
  await page.waitForTimeout(100);
  const hovered = await position();
  await page.waitForTimeout(700);
  const still = await position();
  results.hoverStopsWalk = Math.hypot(still.x - hovered.x, still.y - hovered.y) < 1;
  for (let i = 0; i < 8; i++) await page.mouse.move(still.x + 35 + (i % 2) * 22, still.y + 54, { steps: 2 });
  results.petting = await pet.getAttribute("data-mood") === "happy";
  await page.screenshot({ path: join(screenshots, "showcase-petting.png") });
  await page.getByRole("button", { name: "用毛线球逗小猫" }).click();
  results.play = await pet.getAttribute("data-mood") === "play";
  await page.getByRole("button", { name: "暂停小猫散步" }).click();
  await page.mouse.move(700, 400);
  await page.evaluate(() => document.activeElement?.blur());
  const paused = await position();
  await page.waitForTimeout(3500);
  results.pause = Math.hypot((await position()).x - paused.x, (await position()).y - paused.y) < 1;

  const body = page.getByRole("button", { name: "抚摸糯米小猫，可拖动" });
  const box = await body.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(600, 400, { steps: 12 });
  const dragged = await position();
  results.drag = dragged.x > 400;
  await page.mouse.up();
  await page.waitForTimeout(900);
  results.safeDrop = await overlapFree() && (await position()).x < 50;
  await page.getByRole("button", { name: "关闭小猫", exact: true }).click();
  results.close = await pet.count() === 0;
  await page.reload({ waitUntil: "domcontentloaded" });
  results.dismissPersists = await pet.count() === 0;
  await page.getByRole("button", { name: "召唤小猫" }).click();
  await pet.waitFor({ state: "visible" });
  results.recall = true;
  const frame = await (await page.locator(".agent-showcase-frame").elementHandle()).contentFrame();
  await frame.waitForFunction(() => window.__LUMORA_SOURCE_SCROLL__, null, { timeout: 30000 });
  await frame.evaluate(() => parent.postMessage({ type: "lumora:open-agent" }, location.origin));
  await page.locator(".agent-use-page").waitFor();
  await pet.waitFor({ state: "visible" });
  results.chatPet = await overlapFree();
  await page.mouse.move(700, 400);
  await page.waitForTimeout(12500);
  results.askHint = await page.locator(".pet-cat-speech").isVisible()
    && (await page.locator(".pet-cat-speech").textContent()).includes("Agent");
  await page.screenshot({ path: join(screenshots, "chat-hint.png") });
  const input = page.locator(".agent-composer textarea");
  await input.fill("想了解 AES");
  const typingPosition = await position();
  await page.waitForTimeout(1000);
  results.typingStopsWalk = Math.hypot((await position()).x - typingPosition.x, (await position()).y - typingPosition.y) < 1;
  results.noOverlap = true;
  for (const viewport of [{ width: 1440, height: 960 }, { width: 1280, height: 720 }, { width: 390, height: 844 }, { width: 375, height: 667 }]) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(1000);
    results.noOverlap &&= await overlapFree();
    assert.ok(await pet.isVisible(), `Cat is missing at ${viewport.width}`);
    await page.screenshot({ path: join(screenshots, `chat-cat-${viewport.width}.png`) });
  }
  await page.getByRole("button", { name: "关闭小猫", exact: true }).click();
  await page.getByRole("button", { name: "召唤小猫" }).click();
  await pet.waitFor({ state: "visible" });
  results.mobileRecall = true;
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForFunction(() => document.querySelector(".pet-cat")?.dataset.paused === "true");
  await page.goto(`${base}/#agent`, { waitUntil: "domcontentloaded" });
  await pet.waitFor({ state: "visible" });
  results.reducedMotion = await pet.getAttribute("data-paused") === "true";
  await page.goto(`${base}/#innovation`, { waitUntil: "domcontentloaded" });
  results.scopedPages = await pet.count() === 0;
  results.noRuntimeErrors = errors.length === 0;
  assert.ok(Object.values(results).every(Boolean), JSON.stringify({ results, errors }, null, 2));
  console.log(JSON.stringify({ ok: true, results, errors, screenshots }, null, 2));
} finally { await browser?.close(); server.kill(); }
