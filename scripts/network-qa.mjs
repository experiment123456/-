import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { browserLocation } from "./browser-utils.mjs";
import { md5 } from "../src/crypto/engine.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = await mkdtemp(join(tmpdir(), "lumora-network-qa-"));
const children = [];
let browser;
async function start(name) {
  const args = process.env.LUMORA_QA_SERVER === "vite" ? ["node_modules/vite/bin/vite.js", "--host", "0.0.0.0", "--port", "0"] : ["server.mjs"];
  const child = spawn(process.execPath, args, {
    cwd: root, env: { ...process.env, PORT: "0", LUMORA_USER_DATA: join(output, name + "-users.json") },
    stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
  });
  children.push(child);
  return new Promise((resolve, reject) => {
    let logs = "";
    const timer = setTimeout(() => reject(new Error(`Start timeout: ${logs}`)), 12000);
    child.once("error", (e) => { clearTimeout(timer); reject(e); });
    child.once("exit", (code) => { clearTimeout(timer); reject(new Error(`Server exit ${code}: ${logs}`)); });
    child.stderr.on("data", (data) => { logs += data; });
    child.stdout.on("data", (data) => {
      logs += data;
      const match = logs.match(/http:\/\/localhost:(\d+)/);
      if (match) { clearTimeout(timer); resolve(`http://localhost:${match[1]}/`); }
    });
  });
}
async function enabled(locator) {
  await locator.waitFor();
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    if (await locator.isEnabled()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Control stayed disabled: ${locator}`);
}
async function accept(sender, receiver) {
  const button = receiver.getByRole("button", { name: "接受该算法", exact: true });
  await enabled(button);
  await button.click();
  await enabled(sender.locator(".composer textarea"));
}
const results = {};
try {
  const [baseA, baseB] = await Promise.all([start("a"), start("b")]);
  const [infoA, infoB] = await Promise.all([fetch(baseA + "api/relay/info").then((r) => r.json()), fetch(baseB + "api/relay/info").then((r) => r.json())]);
  assert.notEqual(infoA.serverId, infoB.serverId);
  const endpoint = process.env.LUMORA_QA_LAN === "1" && infoA.lanUrls.length ? infoA.lanUrls[0] : baseA.replace("http:", "ws:") + "ws";
  console.log("Independent services ready; shared relay:", endpoint);
  browser = await chromium.launch({ ...browserLocation(), headless: true });
  const contexts = await Promise.all([browser.newContext({ viewport: { width: 1440, height: 1000 } }), browser.newContext({ viewport: { width: 1440, height: 1000 } })]);
  const pageErrors = [];
  for (const context of contexts) {
    // Core functionality has no dependency on the optional online visual assets.
    await context.route("**/*", (route) => /^http:\/\/localhost:/.test(route.request().url()) ? route.continue() : route.abort());
    context.on("page", (page) => page.on("pageerror", (error) => pageErrors.push(error.message)));
  }
  const sender = await contexts[0].newPage(), receiver = await contexts[1].newPage();
  sender.setDefaultTimeout(15000); receiver.setDefaultTimeout(15000);
  const wire = [];
  sender.on("websocket", (socket) => socket.on("framesent", ({ payload }) => { try { wire.push(JSON.parse(String(payload))); } catch { /* ignore non-JSON */ } }));
  await Promise.all([sender.goto(baseA + "#network"), receiver.goto(baseB + "#network")]);
  for (const page of [sender, receiver]) await page.getByLabel("房间码", { exact: true }).fill("TWO-SERVICES");
  // First reproduce isolation: equal room code with each computer's own relay is insufficient.
  await receiver.getByRole("button", { name: "解密端", exact: true }).click();
  await Promise.all([sender.getByRole("button", { name: "连接安全房间" }).click(), receiver.getByRole("button", { name: "连接安全房间" }).click()]);
  await Promise.all([sender.getByTestId("relay-server-id").waitFor(), receiver.getByTestId("relay-server-id").waitFor()]);
  assert.notEqual(await sender.getByTestId("relay-server-id").textContent(), await receiver.getByTestId("relay-server-id").textContent());
  for (const page of [sender, receiver]) assert.equal(await page.locator(".composer textarea").isDisabled(), true);
  for (const page of [sender, receiver]) {
    await page.getByRole("button", { name: "断开连接", exact: true }).click();
    await page.getByLabel("中继服务器地址", { exact: true }).fill(endpoint);
  }
  await Promise.all([sender.getByRole("button", { name: "连接安全房间" }).click(), receiver.getByRole("button", { name: "连接安全房间" }).click()]);
  await Promise.all([sender.getByText(/DH 交换完成/).waitFor(), receiver.getByText(/DH 交换完成/).waitFor()]);
  assert.equal(await sender.getByTestId("relay-server-id").textContent(), infoA.serverId);
  assert.equal(await receiver.getByTestId("relay-server-id").textContent(), infoA.serverId);
  await accept(sender, receiver);
  console.log("Shared relay DH and negotiation passed");
  const ids = ["aes", "multiliteral", "autokey", "playfair", "double", "ca", "sm2"];
  for (const [index, algorithm] of ids.entries()) {
    if (index) {
      await sender.getByLabel("通信算法", { exact: true }).selectOption(algorithm);
      await sender.getByRole("button", { name: "向对端发起协商" }).click();
      await receiver.waitForFunction((id) => document.querySelector('select[aria-label="通信算法"]')?.value === id, algorithm);
      await accept(sender, receiver);
    }
    const text = `${algorithm}: 你好！中文通信 🔐\nHello jolly XX / 2026`;
    await sender.locator(".composer textarea").fill(text);
    await sender.getByRole("button", { name: "加密发送", exact: true }).click();
    const bubble = receiver.locator(".chat-row.is-in .chat-bubble").filter({ hasText: text });
    await bubble.waitFor();
    assert.equal(await bubble.locator("p").textContent(), text);
    assert.ok((await bubble.textContent()).includes("MD5 ✓"));
    const frame = wire.filter((item) => item.type === "chat").at(-1);
    assert.equal(frame.algorithm, algorithm);
    assert.notEqual(frame.payload, text);
    assert.ok(!frame.payload.includes("你好"));
    assert.equal(frame.digest, md5(text));
    console.log("Chinese network message passed:", algorithm);
  }
  results.crossServiceChineseMessages = ids;
  for (const [name, buffer] of [["中文传输.json", Buffer.from('{"内容":"你好，队友🔐"}\n')], ["empty.txt", Buffer.alloc(0)]]) {
    await sender.locator('input[type="file"]').setInputFiles({ name, mimeType: "application/octet-stream", buffer });
    const card = receiver.locator(".file-card").filter({ hasText: name });
    await card.waitFor();
    assert.ok((await card.textContent()).includes("MD5 已验证"));
    assert.deepEqual(Buffer.from(await card.evaluate(async (a) => Array.from(new Uint8Array(await (await fetch(a.href)).arrayBuffer())))), buffer);
    await enabled(sender.locator(".composer textarea"));
  }
  results.fileByteRoundTrips = 2;
  await receiver.screenshot({ path: join(output, "shared-relay.png"), fullPage: true });
  const fingerprint = await sender.getByText(/DH 交换完成/).last().textContent();
  await receiver.getByRole("button", { name: "断开连接", exact: true }).click();
  await sender.getByText("等待另一端：请核对中继服务标识、房间码和相反角色", { exact: true }).waitFor();
  assert.equal(await sender.locator(".composer textarea").isDisabled(), true);
  await receiver.getByRole("button", { name: "加密端", exact: true }).click();
  await receiver.getByRole("button", { name: "连接安全房间" }).click();
  await receiver.getByText(/房间内已有相同角色/).first().waitFor();
  assert.equal(await receiver.getByRole("button", { name: "解密端", exact: true }).isEnabled(), true);
  await receiver.getByRole("button", { name: "解密端", exact: true }).click();
  await receiver.getByRole("button", { name: "连接安全房间" }).click();
  await receiver.getByText(/DH 交换完成/).waitFor();
  await sender.waitForFunction(() => document.querySelectorAll(".system-message").length > 0 && [...document.querySelectorAll(".system-message")].filter((e) => e.textContent.includes("DH 交换完成")).length === 2);
  assert.notEqual(await sender.getByText(/DH 交换完成/).last().textContent(), fingerprint);
  assert.equal(await sender.locator(".composer textarea").isDisabled(), true, "rejoin must reset algorithm acceptance");
  await accept(sender, receiver);
  results.rejoinResetsKeysAndNegotiation = true;
  results.sameRoleRecovery = true;
  console.log("Files, reconnect, and same-role recovery passed");

  // Exercise the actual workbench UI, including the exact short Chinese bug report.
  const workbench = await contexts[0].newPage();
  await workbench.goto(baseA + "#workbench");
  let uiRoundTrips = 0;
  const order = ["multiliteral", "autokey", "playfair", "double", "ca", "aes", "sm2"];
  for (const [index, algorithm] of order.entries()) {
    await workbench.locator(".algorithm-tab").nth(index).click();
    await workbench.getByRole("button", { name: "加密", exact: true }).click();
    for (const plain of ["你好", "中文与英文 Hello 🔐\n第二行 123！"]) {
      await workbench.locator("textarea").first().fill(plain);
      await workbench.getByRole("button", { name: "执行加密", exact: true }).click();
      await workbench.locator(".status-note").filter({ hasText: "加密完成" }).waitFor();
      const cipher = await workbench.locator("textarea").nth(1).inputValue();
      assert.notEqual(cipher, plain, algorithm);
      assert.ok(!cipher.includes("你好"), algorithm);
      await workbench.getByRole("button", { name: "解密", exact: true }).click();
      await workbench.locator("textarea").first().fill(cipher);
      await workbench.getByRole("button", { name: "执行解密", exact: true }).click();
      await workbench.getByText("解密完成", { exact: true }).waitFor();
      assert.equal(await workbench.locator("textarea").nth(1).inputValue(), plain, algorithm);
      await workbench.getByRole("button", { name: "加密", exact: true }).click();
      uiRoundTrips++;
    }
    console.log("Chinese workbench round trip passed:", algorithm);
  }
  await workbench.locator(".algorithm-tab").nth(7).click();
  await workbench.locator("textarea").first().fill("你好，队友！");
  await workbench.getByRole("button", { name: "计算 MD5", exact: true }).click();
  await workbench.getByText("摘要计算完成", { exact: true }).waitFor();
  assert.equal(await workbench.locator("textarea").nth(1).inputValue(), md5("你好，队友！"));
  results.workbenchRoundTrips = uiRoundTrips;
  results.md5ChineseUi = true;
  assert.deepEqual(pageErrors, []);
  console.log(JSON.stringify({ ...results, relayEndpoint: endpoint, independentServices: [baseA, baseB], pageErrors, artifacts: output }, null, 2));
} finally {
  try { await browser?.close(); } finally { children.forEach((child) => child.kill()); }
}
