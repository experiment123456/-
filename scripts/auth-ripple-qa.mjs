import { chromium } from "playwright-core";
import { browserLocation, screenshotDirectory } from "./browser-utils.mjs";

const base = process.argv[2] || "http://127.0.0.1:5173/";
const screenshotDir = screenshotDirectory("lumora-auth-qa");

const browser = await chromium.launch({ ...browserLocation(), headless: true, args: ["--autoplay-policy=document-user-activation-required"] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const errors = [];
let mainFrameNavigations = 0;
page.on("console", (message) => {
  if (message.type() !== "error") return;
  const source = message.location().url;
  if (source && new URL(source).origin !== new URL(base).origin) return;
  errors.push(source ? `${message.text()} (${source})` : message.text());
});
page.on("pageerror", (error) => errors.push(error.message));
page.on("framenavigated", (frame) => { if (frame === page.mainFrame()) mainFrameNavigations += 1; });

const results = {};
const username = `qa_${Date.now().toString(36)}`;
const password = "DeepOcean_2026";

try {
  await page.goto(base, { waitUntil: "networkidle" });
  results.entryStartsAtLogin = await page.getByRole("button", { name: "进入实验平台" }).isVisible();
  await page.screenshot({ path: `${screenshotDir}/login-desktop.png`, animations: "disabled" });
  const loginVideo = page.locator(".auth-whale-video");
  await loginVideo.evaluate((video) => new Promise((resolve) => {
    if (video instanceof HTMLVideoElement && video.readyState >= 2) resolve(true);
    else video.addEventListener("loadeddata", () => resolve(true), { once: true });
  }));
  const videoState = await loginVideo.evaluate((video) => {
    const media = video;
    return {
      duration: media.duration,
      width: media.videoWidth,
      height: media.videoHeight,
      paused: media.paused,
      muted: media.muted,
      volume: media.volume,
      audioTracks: media.captureStream?.().getAudioTracks().length ?? -1,
      audioBytes: media.webkitAudioDecodedByteCount ?? -1,
    };
  });
  results.loginBackground = videoState.duration > 0 && videoState.width > 0 && videoState.height > 0;
  results.loginVideoPlaying = !videoState.paused;
  results.loginVideoInitiallyMuted = videoState.muted;
  await page.getByRole("button", { name: /开启声音并播放/ }).click();
  results.loginVideoSoundEnabled = await loginVideo.evaluate((video) => !video.muted && video.volume > 0);

  await page.mouse.click(720, 470);
  results.loginClickRipple = await page.locator(".water-ripple-click").count() > 0;
  await page.mouse.move(660, 620);
  for (let x = 680; x <= 880; x += 20) await page.mouse.move(x, 650 + (x % 35), { steps: 1 });
  await page.waitForTimeout(80);
  results.loginMoveTrail = await page.locator(".water-ripple-trail").count() > 0;
  const loginRippleCount = await page.locator(".water-ripple-click").count();
  await page.getByLabel("用户名").click();
  results.loginUiClickExcluded = await page.locator(".water-ripple-click").count() === loginRippleCount;
  results.glassCard = await page.locator(".auth-card").evaluate((element) => {
    const style = getComputedStyle(element);
    return style.backdropFilter !== "none" && Number.parseFloat(style.borderRadius) >= 20;
  });
  results.noRefreshLoop = mainFrameNavigations === 1;

  await page.getByRole("tab", { name: "注册" }).click();
  await page.getByLabel("昵称").fill("深海测试员");
  await page.getByLabel("用户名").fill(username);
  await page.getByLabel("密码", { exact: true }).fill(password);
  await page.getByLabel("确认密码").fill(password);
  await page.getByRole("button", { name: "创建并进入" }).click();
  await page.getByRole("heading", { name: /Security in an Endlessly/ }).waitFor();
  results.register = new URL(page.url()).hash === "";
  await page.getByRole("button", { name: "打开账户中心" }).click();
  await page.getByText("沉浸式偏好", { exact: true }).waitFor();
  await page.screenshot({ path: `${screenshotDir}/account-desktop.png`, animations: "disabled" });

  await page.reload({ waitUntil: "networkidle" });
  results.sessionPersistence = await page.getByText("沉浸式偏好", { exact: true }).isVisible();

  await page.getByText("背景自动轮播", { exact: true }).click();
  await page.getByRole("button", { name: "保存偏好" }).click();
  await page.getByText("账户偏好已保存", { exact: true }).waitFor();
  results.preferenceSave = true;

  await page.getByRole("button", { name: "退出登录" }).click();
  await page.getByRole("button", { name: "登录账户" }).click();
  await page.getByLabel("用户名").fill(username);
  await page.getByLabel("密码", { exact: true }).fill(password);
  await page.getByRole("button", { name: "进入实验平台" }).click();
  await page.getByRole("heading", { name: /Security in an Endlessly/ }).waitFor();
  await page.getByRole("button", { name: "打开账户中心" }).click();
  await page.getByText("沉浸式偏好", { exact: true }).waitFor();
  results.login = true;

  await page.getByRole("button", { name: "返回首页" }).click();
  await page.waitForTimeout(250);
  await page.mouse.click(74, 420);
  results.clickRipple = await page.locator(".water-ripple-click").count() === 1;

  const clickCount = await page.locator(".water-ripple-click").count();
  await page.getByRole("button", { name: "Golden Hour", exact: true }).click();
  results.uiClickExcluded = await page.locator(".water-ripple-click").count() === clickCount;

  await page.mouse.move(45, 300);
  for (let x = 60; x <= 380; x += 20) await page.mouse.move(x, 330 + (x % 45), { steps: 1 });
  await page.waitForTimeout(80);
  const trailCount = await page.locator(".water-ripple-trail").count();
  results.moveTrail = trailCount > 0;
  results.trailLimit = trailCount <= 15;

  for (let index = 0; index < 12; index += 1) await page.mouse.click(50 + index * 24, 470);
  results.clickLimit = await page.locator(".water-ripple-click").count() <= 7;
  await page.screenshot({ path: `${screenshotDir}/home-ripples.png` });

  await page.getByRole("button", { name: "待创新", exact: true }).first().click();
  await page.getByRole("heading", { name: "待创新页面" }).waitFor();
  results.innovationAfterHome = page.url().endsWith("#innovation");

  const mobile = await context.newPage();
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mobile.goto(`${base}#login`, { waitUntil: "networkidle" });
  results.mobileOverflow = await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight);
  await mobile.screenshot({ path: `${screenshotDir}/login-mobile.png`, animations: "disabled" });
  await mobile.close();

  results.consoleErrors = errors;
  console.log(JSON.stringify({ ok: Object.entries(results).every(([key, value]) => key === "consoleErrors" ? Array.isArray(value) && value.length === 0 : value === true), results, screenshots: screenshotDir }, null, 2));
} finally {
  await browser.close();
}
