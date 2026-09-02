import { chromium } from "playwright-core";
import { browserLocation, screenshotDirectory } from "./browser-utils.mjs";

const base = process.argv[2] || "http://127.0.0.1:5173/";
const screenshotDir = screenshotDirectory("lumora-qa");
const browser = await chromium.launch({ ...browserLocation(), headless: true, args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const consoleErrors = [];
page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
page.on("pageerror", (error) => consoleErrors.push(error.message));

const results = {};
async function snap(target, path) {
  await target.locator("video").evaluateAll((videos) => videos.forEach((video) => video.pause()));
  await target.screenshot({ path: `${screenshotDir}/${path}`, animations: "disabled", timeout: 20_000 });
}
try {
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "返回首页", exact: true }).click();
  await page.waitForTimeout(1800);
  results.homeTitle = await page.locator("h1").innerText();
  results.homeOverflow = await page.evaluate(() => ({
    horizontal: document.documentElement.scrollWidth > innerWidth,
    vertical: document.documentElement.scrollHeight > innerHeight,
  }));
  await page.locator("video").nth(0).dispatchEvent("ended");
  await page.getByRole("button", { name: "Still Water", exact: true }).waitFor();
  results.videoAutoAdvance = await page.getByRole("button", { name: "Still Water", exact: true }).getAttribute("aria-pressed") === "true";
  await page.waitForTimeout(1100);
  await page.getByRole("button", { name: "Quiet Dawn", exact: true }).click();
  results.videoManualSwitch = await page.getByRole("button", { name: "Quiet Dawn", exact: true }).getAttribute("aria-pressed") === "true";
  await page.locator("video").evaluateAll((videos) => videos.forEach((video) => { video.pause(); video.removeAttribute("src"); video.load(); }));

  results.crypto = "covered-by-separate-node-suite";

  const homeShot = await context.newPage();
  await homeShot.goto(base, { waitUntil: "domcontentloaded" });
  await homeShot.getByRole("button", { name: "返回首页", exact: true }).click();
  await homeShot.waitForTimeout(900);
  await snap(homeShot, "qa-home.png");
  await homeShot.close().catch(() => undefined);

  await page.goto(`${base}#workbench`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(900);
  const inputArea = page.locator("textarea").nth(0);
  const outputArea = page.locator("textarea").nth(1);
  const aesPlain = await inputArea.inputValue();
  await page.getByRole("button", { name: "执行加密" }).click();
  await page.getByText("加密完成", { exact: true }).waitFor();
  const aesCipher = await outputArea.inputValue();
  await page.getByRole("button", { name: "解密", exact: true }).click();
  await inputArea.fill(aesCipher);
  await page.getByRole("button", { name: "执行解密" }).click();
  await page.getByText("解密完成", { exact: true }).waitFor();
  results.workbenchAes = (await outputArea.inputValue()) === aesPlain;

  await page.getByRole("button", { name: /消息摘要/ }).click();
  await page.getByRole("button", { name: "计算 MD5" }).click();
  await page.getByText("摘要计算完成", { exact: true }).waitFor();
  results.workbenchMd5 = (await outputArea.inputValue()) === "5d41402abc4b2a76b9719d911017c592";

  const workbenchShot = await context.newPage();
  await workbenchShot.goto(`${base}#workbench`, { waitUntil: "domcontentloaded" });
  await workbenchShot.waitForTimeout(500);
  await snap(workbenchShot, "qa-workbench.png");
  await workbenchShot.close().catch(() => undefined);

  await page.goto(`${base}#dh`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "开始公钥交换" }).click();
  await page.getByText("交换成功，两端密钥一致").waitFor();
  results.dhUi = true;
  await snap(page, "qa-dh.png");

  const networkA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const networkB = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const sender = await networkA.newPage();
  const receiver = await networkB.newPage();
  sender.on("pageerror", (error) => consoleErrors.push(`sender: ${error.message}`));
  receiver.on("pageerror", (error) => consoleErrors.push(`receiver: ${error.message}`));
  await Promise.all([
    sender.goto(`${base}#network`, { waitUntil: "domcontentloaded" }),
    receiver.goto(`${base}#network`, { waitUntil: "domcontentloaded" }),
  ]);
  const room = "QA-LUMORA-26";
  await sender.getByLabel("房间码", { exact: true }).fill(room);
  await receiver.getByLabel("房间码", { exact: true }).fill(room);
  await receiver.getByRole("button", { name: "解密端" }).click();
  await Promise.all([
    sender.getByRole("button", { name: "连接安全房间" }).click(),
    receiver.getByRole("button", { name: "连接安全房间" }).click(),
  ]);
  await Promise.all([
    sender.getByText(/DH 交换完成/).waitFor({ timeout: 20_000 }),
    receiver.getByText(/DH 交换完成/).waitFor({ timeout: 20_000 }),
  ]);
  await receiver.getByRole("button", { name: "接受该算法" }).click();
  await sender.getByText(/算法协商完成/).waitFor({ timeout: 10_000 });
  const secureMessage = "来自加密端的 WebSocket 安全消息 2026";
  await sender.locator(".composer textarea").fill(secureMessage);
  await sender.getByRole("button", { name: /加密发送/ }).click();
  await receiver.getByText(secureMessage, { exact: true }).waitFor({ timeout: 15_000 });
  results.socketMessage = true;
  await sender.locator('input[type="file"]').setInputFiles({
    name: "qa-transfer.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Lumora encrypted file transfer / 文件往返"),
  });
  await receiver.getByText("qa-transfer.txt", { exact: true }).waitFor({ timeout: 20_000 });
  results.socketFile = await receiver.getByText("MD5 已验证", { exact: true }).isVisible();
  await snap(sender, "qa-network-sender.png");
  await snap(receiver, "qa-network-receiver.png");
  await networkA.close();
  await networkB.close();

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const mobilePage = await mobile.newPage();
  await mobilePage.goto(base, { waitUntil: "domcontentloaded" });
  await mobilePage.waitForTimeout(800);
  results.mobileHomeOverflow = await mobilePage.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  await snap(mobilePage, "qa-mobile-home.png");
  await mobilePage.close().catch(() => undefined);
  const mobileNetworkPage = await mobile.newPage();
  await mobileNetworkPage.goto(`${base}#network`, { waitUntil: "domcontentloaded" });
  await mobileNetworkPage.waitForTimeout(500);
  results.mobileNetworkOverflow = await mobileNetworkPage.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  await snap(mobileNetworkPage, "qa-mobile-network.png");
  await mobile.close();
  results.consoleErrors = consoleErrors;
  console.log(JSON.stringify(results, null, 2));
} finally {
  await context.close();
  await browser.close();
}
