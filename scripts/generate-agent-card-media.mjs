import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { browserLocation } from "./browser-utils.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = fileURLToPath(new URL("../public/active-theory/assets/agent-cards/", import.meta.url));
const base = process.argv[2] || "http://127.0.0.1:4177/active-theory/agent-card.html";
const cards = ["welcome", "guide", "capabilities", "security", "launch"];

await mkdir(output, { recursive: true });
const browser = await chromium.launch({ ...browserLocation(), headless: true, args: ["--no-sandbox"] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  for (const card of cards) {
    await page.goto(`${base}?card=${card}`, { waitUntil: "networkidle" });
    const png = await page.screenshot({ animations: "disabled" });
    await writeFile(`${output}${card}.png`, png);
    const pngData = `data:image/png;base64,${png.toString("base64")}`;
    const webm = await page.evaluate(async (source) => {
      const image = new Image();
      image.src = source;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = 1280;
      canvas.height = 720;
      const context = canvas.getContext("2d");
      const stream = canvas.captureStream(24);
      const recorder = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp8", videoBitsPerSecond: 1_800_000 });
      const chunks = [];
      recorder.addEventListener("dataavailable", (event) => event.data.size && chunks.push(event.data));
      const stopped = new Promise((resolve) => recorder.addEventListener("stop", resolve, { once: true }));
      recorder.start();
      const started = performance.now();
      await new Promise((resolve) => {
        const draw = (time) => {
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          if (time - started < 1_200) requestAnimationFrame(draw);
          else resolve();
        };
        requestAnimationFrame(draw);
      });
      recorder.stop();
      await stopped;
      const bytes = new Uint8Array(await new Blob(chunks, { type: "video/webm" }).arrayBuffer());
      let binary = "";
      for (let index = 0; index < bytes.length; index += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
      }
      return btoa(binary);
    }, pngData);
    await writeFile(`${output}${card}.webm`, Buffer.from(webm, "base64"));
  }
  console.log(JSON.stringify({ ok: true, output, cards, root }, null, 2));
} finally {
  await browser.close();
}
