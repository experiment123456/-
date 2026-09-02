import assert from "node:assert/strict";
import { readFile, mkdtemp } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { browserLocation } from "./browser-utils.mjs";

const root = new URL("../", import.meta.url);
const output = await mkdtemp(join(tmpdir(), "lumora-share-qa-"));
const results = {};
const manifest = JSON.parse(await readFile(new URL("public/assets/ONLINE-SOURCES.json", root), "utf8"));
const appSource = await readFile(new URL("src/App.tsx", root), "utf8");
for (const video of manifest.videos) {
  assert.ok(appSource.includes(video.source), `Original video URL missing: ${video.label}`);
}
assert.ok(appSource.includes(manifest.windowImage));
assert.ok((await readFile(new URL("index.html", root), "utf8")).includes(manifest.fontStylesheet));
results.originalOnlineReferences = true;
await readFile(new URL("dist/index.html", root));

const server = spawn(process.execPath, [fileURLToPath(new URL("server.mjs", root))], {
  cwd: fileURLToPath(root),
  env: { ...process.env, PORT: "0", LUMORA_USER_DATA: join(output, "users.json") },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});
let browser;
let serverLogs = "";
server.stderr.on("data", (chunk) => { serverLogs += chunk; });

try {
  const base = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Server startup timeout: ${serverLogs}`)), 15_000);
    server.once("error", (error) => { clearTimeout(timer); reject(error); });
    server.once("exit", (code) => { clearTimeout(timer); reject(new Error(`Server exited ${code}: ${serverLogs}`)); });
    server.stdout.on("data", (chunk) => {
      serverLogs += chunk;
      const match = serverLogs.match(/http:\/\/localhost:(\d+)/);
      if (match) { clearTimeout(timer); resolve(`http://127.0.0.1:${match[1]}/`); }
    });
  });
  for (const [path, mime] of [
    ["assets/abyss-whale-login.mp4", "video/mp4"],
    ["assets/komorebi.mp3", "audio/mpeg"],
  ]) {
    const head = await fetch(base + path, { method: "HEAD" });
    assert.equal(head.status, 200);
    assert.equal(head.headers.get("content-type"), mime);
    const range = await fetch(base + path, { headers: { Range: "bytes=0-31" } });
    assert.equal(range.status, 206);
    assert.equal((await range.arrayBuffer()).byteLength, 32);
    const suffix = await fetch(base + path, { headers: { Range: "bytes=-16" } });
    assert.equal(suffix.status, 206);
    assert.equal((await suffix.arrayBuffer()).byteLength, 16);
    const invalid = await fetch(base + path, { headers: { Range: "bytes=999999999999-" } });
    assert.equal(invalid.status, 416);
  }
  assert.equal((await fetch(base + "assets/does-not-exist.mp4")).status, 404);
  results.mediaHttp = true;

  // Register only against the isolated test server, never the user's running app.
  const registration = await fetch(base + "api/auth/register", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "share_qa", displayName: "Share QA", password: "ShareQA_2026!" }),
  });
  assert.equal(registration.status, 201);
  results.isolatedRegistration = true;

  browser = await chromium.launch({ ...browserLocation(), headless: true, args: ["--autoplay-policy=document-user-activation-required"] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const externalRequests = [];
  const pageErrors = [];
  context.on("request", (request) => {
    const url = new URL(request.url());
    if (["http:", "https:"].includes(url.protocol) && url.origin !== new URL(base).origin) {
      externalRequests.push(url.href);
    }
  });
  context.on("page", (page) => page.on("pageerror", (error) => pageErrors.push(error.message)));
  const page = await context.newPage();
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => {
    const video = document.querySelector(".auth-whale-video");
    return video && video.readyState >= 2 && video.videoWidth > 0 && !video.paused && video.currentTime > 0;
  });
  assert.equal(await page.locator(".auth-whale-video").evaluate((video) => video.muted), true);
  await page.getByRole("button", { name: /开启声音并播放/ }).click();
  await page.waitForFunction(() => { const video = document.querySelector(".auth-whale-video"); return video && !video.muted && !video.paused; });
  results.loginAnimationAndSound = true;
  await page.getByRole("button", { name: "返回首页", exact: true }).click();
  await page.getByRole("heading", { name: /Security in an Endlessly/ }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => Array.from(document.fonts).some((font) => font.family.includes("Instrument Serif") && font.status === "loaded"), null, { timeout: 60_000 });
  await page.waitForFunction(() => {
    const img = document.querySelector(".train-bob");
    return img && img.complete && img.naturalWidth > 0;
  }, null, { timeout: 60_000 });
  assert.equal(await page.locator(".train-bob").getAttribute("src"), manifest.windowImage);
  for (const { label, source } of manifest.videos) {
    await page.getByRole("button", { name: label, exact: true }).click();
    await page.waitForFunction((name) => {
      const video = document.querySelector(`video[aria-label="${name} ambient background"]`);
      return video && video.readyState >= 2 && video.videoWidth > 0 && video.duration > 0 && !video.paused && video.currentTime > 0.1;
    }, label, { timeout: 60_000 });
    const video = page.locator(`video[aria-label="${label} ambient background"]`);
    assert.equal(await video.getAttribute("src"), source);
    const transition = await video.evaluate((element) => ({ property: getComputedStyle(element).transitionProperty, duration: getComputedStyle(element).transitionDuration }));
    assert.equal(transition.property, "opacity");
    assert.equal(transition.duration, "1s");
    await page.waitForTimeout(1100);
  }
  results.onlineVideosAndFonts = true;
  results.oneSecondCrossFade = true;
  await page.locator('video[aria-label="Quiet Dawn ambient background"]').dispatchEvent("ended");
  await page.waitForFunction(() => document.querySelector('video[aria-label="Golden Hour ambient background"]')?.classList.contains("opacity-100"));
  results.autoAdvance = true;
  await page.waitForTimeout(1200);
  await page.locator("video").evaluateAll((videos) => videos.forEach((video) => video.pause()));
  await page.screenshot({ path: join(output, "home-online-assets.png"), animations: "disabled" });

  await page.goto(base + "#workbench", { waitUntil: "domcontentloaded" });
  const plain = await readFile(new URL("test-data/lumora-upload-中文长文本.txt", root), "utf8");
  await page.locator('input[type="file"]').setInputFiles(fileURLToPath(new URL("test-data/lumora-upload-中文长文本.txt", root)));
  await page.waitForFunction((text) => document.querySelector("textarea")?.value === text, plain);
  await page.getByRole("button", { name: "执行加密", exact: true }).click();
  await page.getByText("加密完成", { exact: true }).waitFor();
  const cipher = await page.locator("textarea").nth(1).inputValue();
  await page.getByRole("button", { name: "解密", exact: true }).click();
  await page.locator("textarea").first().fill(cipher);
  await page.getByRole("button", { name: "执行解密", exact: true }).click();
  await page.getByText("解密完成", { exact: true }).waitFor();
  assert.equal(await page.locator("textarea").nth(1).inputValue(), plain);
  results.aesUploadRoundTrip = true;

  await page.goto(base + "#dh", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "开始公钥交换" }).click();
  await page.getByText("交换成功，两端密钥一致", { exact: true }).waitFor();
  results.dh = true;

  const sender = await context.newPage();
  const receiver = await context.newPage();
  await Promise.all([sender.goto(base + "#network"), receiver.goto(base + "#network")]);
  for (const peer of [sender, receiver]) await peer.getByLabel("房间码", { exact: true }).fill("SHARE-QA");
  await receiver.getByRole("button", { name: "解密端", exact: true }).click();
  await Promise.all([sender.getByRole("button", { name: "连接安全房间" }).click(), receiver.getByRole("button", { name: "连接安全房间" }).click()]);
  await Promise.all([sender.getByText(/DH 交换完成/).waitFor(), receiver.getByText(/DH 交换完成/).waitFor()]);
  await receiver.getByRole("button", { name: "接受该算法" }).click();
  await sender.getByText(/算法协商完成/).waitFor();
  const message = "Share package test / 中文消息 2026 🔐";
  await sender.locator(".composer textarea").fill(message);
  await sender.getByRole("button", { name: /加密发送/ }).click();
  await receiver.getByText(message, { exact: true }).waitFor();
  await sender.locator('input[type="file"]').setInputFiles(fileURLToPath(new URL("test-data/lumora-transfer-payload.json", root)));
  await receiver.getByText("MD5 已验证", { exact: true }).waitFor();
  results.socketMessageAndFile = true;
  for (const video of manifest.videos) assert.ok(externalRequests.includes(video.source), `Video was not requested online: ${video.label}`);
  assert.ok(externalRequests.includes(manifest.windowImage));
  assert.ok(externalRequests.some((url) => url.startsWith(manifest.fontHost + "/")));
  assert.deepEqual(pageErrors, []);
  results.externalRequests = externalRequests.length;
  results.pageErrors = pageErrors.length;
  console.log(JSON.stringify({ ...results, artifacts: output }, null, 2));
} finally {
  try { await browser?.close(); } finally { server.kill(); }
}
