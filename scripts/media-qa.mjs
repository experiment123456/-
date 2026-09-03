import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { browserLocation } from "./browser-utils.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = await mkdtemp(join(tmpdir(), "lumora-media-qa-"));
const server = spawn(process.execPath, process.env.LUMORA_QA_SERVER === "vite"
  ? ["node_modules/vite/bin/vite.js", "--host", "0.0.0.0", "--port", "0"] : ["server.mjs"], {
  cwd: root, env: { ...process.env, PORT: "0", LUMORA_USER_DATA: join(output, "users.json") },
  stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
});
let browser;
const results = {}, pageErrors = [];
const state = (media) => ({ paused: media.paused, muted: media.muted, time: media.currentTime, duration: media.duration, volume: media.volume, error: media.error?.code || null });
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
  browser = await chromium.launch({ ...browserLocation(), headless: true, args: ["--autoplay-policy=document-user-activation-required"] });
  async function pageAt(hash = "", setup = async () => {}) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.route("**/*", (route) => route.request().url().startsWith(base) ? route.continue() : route.abort());
    await setup(context);
    const page = await context.newPage();
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.setDefaultTimeout(12000);
    await page.goto(base + hash, { waitUntil: "domcontentloaded" });
    return page;
  }
  const login = await pageAt();
  await login.waitForFunction(() => document.querySelector(".auth-whale-video")?.readyState >= 2);
  await login.waitForTimeout(650);
  const initialVideo = await login.locator(".auth-whale-video").evaluate(state);
  results.loginInitiallyAnimated = !initialVideo.paused && initialVideo.time > 0;
  assert.equal(initialVideo.muted, true, "initial video must be muted to avoid audible autoplay blocking");
  assert.equal(await login.locator("audio").evaluate((audio) => audio.paused), true, "do not overlap login soundtrack with music");
  await login.getByRole("button", { name: /开启声音并播放/ }).click();
  await login.waitForFunction(() => {
    const video = document.querySelector(".auth-whale-video");
    return video && !video.muted && !video.paused && video.currentTime > 0;
  });
  results.loginSoundAfterClick = true;
  await login.getByRole("button", { name: "返回首页", exact: true }).click();
  await login.waitForFunction(() => { const audio = document.querySelector("audio"); return audio && !audio.paused && !audio.muted && audio.currentTime > 0; });
  results.navigationStartsMusic = true;
  results.loginInitialState = initialVideo;

  const authenticatedMusic = await pageAt();
  await authenticatedMusic.getByRole("tab", { name: "注册" }).click();
  await authenticatedMusic.getByPlaceholder("你希望显示的名字").fill("音乐测试用户");
  await authenticatedMusic.getByPlaceholder("3–24 位中文、字母或数字").fill(`music_${Date.now()}`);
  await authenticatedMusic.getByPlaceholder("至少 8 位").fill("music-test-2026");
  await authenticatedMusic.getByPlaceholder("再次输入密码").fill("music-test-2026");
  await authenticatedMusic.getByRole("button", { name: "创建并进入" }).click();
  await authenticatedMusic.waitForURL((url) => !url.hash);
  await authenticatedMusic.waitForFunction(() => { const audio = document.querySelector("audio"); return audio && !audio.paused && !audio.muted && audio.currentTime > 0; });
  results.authenticationStartsMusic = true;
  await authenticatedMusic.locator(".home-music-toggle").click();
  results.authenticatedMusicCanBeClosed = await authenticatedMusic.locator("audio").evaluate((audio) => audio.paused);
  await authenticatedMusic.context().close();

  const workbench = await pageAt("#workbench");
  await workbench.locator(".home-music-toggle.needs-action").waitFor();
  await workbench.locator(".home-music-toggle").click();
  await workbench.waitForTimeout(650);
  const firstClick = await workbench.locator("audio").evaluate(state);
  results.firstMusicClickPlays = !firstClick.paused && !firstClick.muted && firstClick.volume > 0 && firstClick.time > 0;
  results.firstMusicClickState = firstClick;
  assert.equal(results.firstMusicClickPlays, true, "first music button click must play, not immediately pause again");

  const featureViews = ["workbench", "dh", "network", "catalog", "innovation"];
  for (const hash of featureViews) {
    const page = await pageAt("#" + hash);
    await page.locator(".home-music-toggle.needs-action").waitFor();
    await page.locator(".home-music-toggle").click();
    await page.waitForFunction(() => { const audio = document.querySelector("audio"); return audio && !audio.paused && !audio.muted && audio.currentTime > 0; });
    await page.context().close();
  }
  results.firstClickAcrossFiveViews = true;

  for (const hash of featureViews) {
    await workbench.evaluate((value) => { location.hash = value; }, hash);
    await workbench.waitForURL((url) => url.hash === "#" + hash);
    await workbench.locator(".home-music-toggle.is-playing").waitFor();
    assert.equal(await workbench.locator("audio").evaluate((audio) => audio.paused), false);
  }
  await workbench.locator(".home-music-toggle").click();
  for (const hash of featureViews) {
    await workbench.evaluate((value) => { location.hash = value; }, hash);
    await workbench.waitForTimeout(100);
    assert.equal(await workbench.locator("audio").evaluate((audio) => audio.paused), true, "manual pause must persist");
  }
  await workbench.locator(".home-music-toggle").click();
  await workbench.waitForFunction(() => !document.querySelector("audio").paused);
  await workbench.evaluate(() => { location.hash = "login"; });
  await workbench.locator(".auth-whale-video").waitFor();
  assert.equal(await workbench.locator("audio").evaluate((audio) => audio.paused), true);
  await workbench.waitForFunction(() => { const video = document.querySelector(".auth-whale-video"); return video && !video.paused && video.currentTime > 0; });
  results.pageSwitchingAndManualPause = true;

  const keyboard = await pageAt("#dh");
  await keyboard.locator(".home-music-toggle.needs-action").waitFor();
  await keyboard.locator(".home-music-toggle").press("Enter");
  await keyboard.waitForFunction(() => { const audio = document.querySelector("audio"); return audio && !audio.paused && audio.currentTime > 0; });
  results.keyboardFirstClick = true;
  const notice = await pageAt("#catalog");
  await notice.locator(".home-music-notice").click();
  await notice.waitForFunction(() => { const audio = document.querySelector("audio"); return audio && !audio.paused && audio.currentTime > 0; });
  results.visibleSoundPrompt = true;
  const gesture = await pageAt("#workbench");
  await gesture.locator(".home-music-toggle.needs-action").waitFor();
  await gesture.locator("textarea").first().click();
  await gesture.waitForFunction(() => { const audio = document.querySelector("audio"); return audio && !audio.paused && audio.currentTime > 0; });
  results.normalGestureUnlock = true;

  let missingAudio = true;
  const retryAudio = await pageAt("#dh", (context) => context.route("**/assets/komorebi.mp3", (route) => missingAudio ? route.fulfill({ status: 404, body: "Not found" }) : route.continue()));
  await retryAudio.locator(".home-music-notice.is-error").waitFor();
  missingAudio = false;
  await retryAudio.locator(".home-music-notice").click();
  await retryAudio.waitForFunction(() => { const audio = document.querySelector("audio"); return audio && !audio.paused && !audio.error && audio.currentTime > 0; });
  let missingVideo = true;
  const retryVideo = await pageAt("", (context) => context.route("**/assets/abyss-whale-login.mp4", (route) => missingVideo ? route.fulfill({ status: 404, body: "Not found" }) : route.continue()));
  await retryVideo.locator(".auth-sound-gate.is-error").waitFor();
  missingVideo = false;
  await retryVideo.locator(".auth-sound-gate").click();
  await retryVideo.waitForFunction(() => { const video = document.querySelector(".auth-whale-video"); return video && !video.paused && !video.muted && !video.error && video.currentTime > 0; });
  results.mediaLoadErrorAndRetry = true;

  // Simulate a stricter browser rejecting a later sound request as well. The
  // audible attempt must fall back to a moving muted video, not a static poster.
  const deniedSound = await pageAt("", (context) => context.addInitScript(() => {
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      if (this instanceof HTMLVideoElement && !this.muted) return Promise.reject(new DOMException("Test audible playback restriction", "NotAllowedError"));
      return play.call(this);
    };
  }));
  await deniedSound.waitForFunction(() => document.querySelector(".auth-whale-video")?.currentTime > 0);
  await deniedSound.locator(".auth-sound-gate").click();
  await deniedSound.waitForFunction(() => { const video = document.querySelector(".auth-whale-video"); return video && video.muted && !video.paused && video.currentTime > 0; });
  results.audibleRejectionKeepsAnimation = true;
  const mobile = await pageAt();
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mobile.waitForFunction(() => document.querySelector(".auth-whale-video")?.currentTime > 0);
  await mobile.screenshot({ path: join(output, "login-mobile.png"), animations: "disabled" });
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  results.mobileVideoAndPrompt = true;
  console.log(JSON.stringify({ results, pageErrors, artifacts: output }, null, 2));
  assert.equal(results.loginInitiallyAnimated, true, "login video must animate before the first user interaction");
  assert.deepEqual(pageErrors, []);
} finally {
  try { await browser?.close(); } finally { server.kill(); }
}
