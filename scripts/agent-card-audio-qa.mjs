import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { browserLocation } from "./browser-utils.mjs";

const server = spawn(process.execPath, ["server.mjs"], {
  cwd: fileURLToPath(new URL("../", import.meta.url)),
  env: { ...process.env, PORT: "0" },
  stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
});
let browser;
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
  await page.addInitScript(() => {
    window.__qaToneStarts = 0;
    const createOscillator = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function () {
      const oscillator = createOscillator.call(this);
      const start = oscillator.start;
      oscillator.start = function (...args) {
        window.__qaToneStarts += 1;
        return start.apply(this, args);
      };
      return oscillator;
    };
  });
  // Test-only mesh discovery: production does not expose scene objects or counters.
  await page.route("**/card-click-audio.js?*", async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}
      window.__qaCards = [];
      (() => {
        const seen = new WeakSet();
        const find = Interaction3D.find;
        Interaction3D.find = function(camera) {
          const interaction = find.call(this, camera);
          if (!seen.has(interaction)) {
            seen.add(interaction);
            const add = interaction.add;
            interaction.add = function(mesh, hover, click, move, seo) {
              const options = seo || move;
              if (options?.url?.startsWith('work/')) {
                window.__qaCards.push({ mesh, camera, url: options.url });
              }
              return add.apply(this, arguments);
            };
          }
          return interaction;
        };
      })();
    ` });
  });
  await page.goto(`${base}/#agent`, { waitUntil: "domcontentloaded" });
  const frame = await (await page.locator(".agent-showcase-frame").elementHandle()).contentFrame();
  await frame.waitForFunction(() => window.__qaCards?.length === 5 && window.__LUMORA_SOURCE_SCROLL__, null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  const baseline = await frame.evaluate(() => window.__qaToneStarts);
  await page.mouse.click(30, 300);
  await page.waitForTimeout(200);
  assert.equal(await frame.evaluate(() => window.__qaToneStarts), baseline, "Blank canvas must stay silent");
  const cards = [];
  for (const index of [0, 1, 2, 3, 4, 0]) {
    await frame.evaluate((i) => window.__qaCards[i].mesh._divFocus(), index);
    await page.waitForTimeout(1800);
    const point = await frame.evaluate((i) => {
      const { mesh, camera, url } = window.__qaCards[i];
      const p = ScreenProjection.find(camera).project(mesh);
      return { x: p.x, y: p.y, url };
    }, index);
    const before = await frame.evaluate(() => window.__qaToneStarts);
    await page.mouse.click(point.x, point.y);
    await page.waitForTimeout(250);
    const after = await frame.evaluate(() => window.__qaToneStarts);
    assert.equal(after - before, 1, `${point.url} must play exactly one click sound`);
    assert.ok(page.url().endsWith("#agent"), "Card click must not navigate the host page");
    cards.push(point.url);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(900);
  }
  await frame.evaluate(() => window.__qaCards[0].mesh._divFocus());
  await page.waitForTimeout(1800);
  const dragPoint = await frame.evaluate(() => {
    const { mesh, camera } = window.__qaCards[0];
    const point = ScreenProjection.find(camera).project(mesh);
    return { x: point.x, y: point.y };
  });
  const beforeDrag = await frame.evaluate(() => window.__qaToneStarts);
  await page.mouse.move(dragPoint.x, dragPoint.y);
  await page.mouse.down();
  await page.mouse.move(dragPoint.x + 150, dragPoint.y + 80, { steps: 15 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  assert.equal(await frame.evaluate(() => window.__qaToneStarts), beforeDrag, "Dragging must stay silent");
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, cards, repeatClick: true, blankCanvasSilent: true, dragSilent: true, errors }, null, 2));
} finally {
  await browser?.close();
  server.kill();
}
