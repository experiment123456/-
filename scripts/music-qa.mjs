import { chromium } from "playwright-core";
import { browserLocation } from "./browser-utils.mjs";

const base = process.argv[2] || "http://127.0.0.1:4173/";
const browser = await chromium.launch({
  ...browserLocation(),
  headless: true,
  args: ["--autoplay-policy=document-user-activation-required"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
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
  await page.goto(base, { waitUntil: "domcontentloaded" });
  const audio = page.locator('audio[src="/assets/komorebi.mp3"]');
  await audio.evaluate((element) => new Promise((resolve) => {
    const media = element;
    if (media.readyState >= 1) resolve(true);
    else media.addEventListener("loadedmetadata", () => resolve(true), { once: true });
  }));
  await page.waitForTimeout(250);
  results.initialLoginPaused = await audio.evaluate((media) => media.paused);
  await page.locator("nav button").first().click();
  await page.waitForURL((url) => !url.hash);
  await page.waitForTimeout(250);
  results.initialHomeControl = await page.locator(".home-music-toggle").isVisible();
  if (await audio.evaluate((media) => media.paused)) {
    await page.locator(".home-music-toggle").click();
    await page.waitForTimeout(150);
  }
  results.startsOnInitialHome = await audio.evaluate((media) => !media.paused);

  await page.evaluate(() => { location.hash = "login"; });
  await page.locator(".auth-card").waitFor();
  await page.locator("nav button").first().click();
  await page.waitForURL((url) => !url.hash);
  await page.waitForTimeout(150);

  const homeState = await audio.evaluate((media) => ({
    duration: media.duration,
    paused: media.paused,
    loop: media.loop,
    volume: media.volume,
    currentTime: media.currentTime,
  }));
  results.localTrackLoaded = homeState.duration > 150;
  results.startsAfterLoginExit = !homeState.paused && homeState.currentTime >= 0;
  results.loops = homeState.loop;
  results.gentleVolume = Math.abs(homeState.volume - 0.24) < 0.01;
  results.controlVisible = await page.locator(".home-music-toggle.is-playing").isVisible();

  await page.locator(".home-music-toggle").click();
  results.manualPause = await audio.evaluate((media) => media.paused);
  await page.locator(".home-music-toggle").click();
  results.manualResume = await audio.evaluate((media) => !media.paused);

  const musicViews = ["workbench", "dh", "network", "catalog", "innovation"];
  const viewStates = [];
  for (const target of musicViews) {
    await page.evaluate((next) => { location.hash = next; }, target);
    await page.waitForURL((url) => url.hash === `#${target}`);
    await page.waitForTimeout(100);
    viewStates.push({
      target,
      playing: await audio.evaluate((media) => !media.paused),
      controlVisible: await page.locator(".home-music-toggle").isVisible(),
    });
  }
  results.continuesAcrossFivePages = viewStates.every((state) => state.playing && state.controlVisible);

  await page.locator(".home-music-toggle").click();
  await page.evaluate(() => { location.hash = "workbench"; });
  await page.waitForURL((url) => url.hash === "#workbench");
  await page.waitForTimeout(100);
  results.manualPausePersists = await audio.evaluate((media) => media.paused);
  await page.locator(".home-music-toggle").click();
  results.resumeFromFeaturePage = await audio.evaluate((media) => !media.paused);

  await page.evaluate(() => { location.hash = "login"; });
  await page.waitForURL((url) => url.hash === "#login");
  await page.waitForTimeout(100);
  results.pausesOnlyOnLogin = await audio.evaluate((media) => media.paused);
  results.noRuntimeErrors = errors.length === 0;
} finally {
  await browser.close();
}

console.log(JSON.stringify({ ok: Object.values(results).every(Boolean), results, errors }, null, 2));
if (!Object.values(results).every(Boolean)) process.exitCode = 1;
