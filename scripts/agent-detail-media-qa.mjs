import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { browserLocation } from "./browser-utils.mjs";

const base = process.argv[2] || "http://127.0.0.1:4177/active-theory/";
const projectFile = fileURLToPath(new URL("../public/active-theory/cms/projects-dev.json", import.meta.url));
const projects = JSON.parse(await readFile(projectFile, "utf8"));
const expectedThumbnails = ["welcome.png", "guide.png", "capabilities.png", "security.png", "launch.png"];

assert.equal(projects.length, 5);
projects.forEach((project, index) => {
  assert.equal(project.video.thumbnail, `assets/agent-cards/${expectedThumbnails[index]}`);
});

const browser = await chromium.launch({ ...browserLocation(), headless: true, args: ["--no-sandbox"] });
try {
  const page = await browser.newPage();
  await page.goto(base, { waitUntil: "domcontentloaded" });
  const media = [];
  for (const project of projects) {
    const result = await page.evaluate(async ({ source, baseUrl }) => {
      const video = document.createElement("video");
      video.muted = true;
      video.preload = "metadata";
      video.src = new URL(source, baseUrl).href;
      await new Promise((resolve, reject) => {
        video.addEventListener("loadedmetadata", resolve, { once: true });
        video.addEventListener("error", () => reject(new Error(`Media error ${video.error?.code || "unknown"}`)), { once: true });
      });
      return { duration: video.duration, width: video.videoWidth, height: video.videoHeight };
    }, { source: project.video.url, baseUrl: base });
    assert.ok(result.duration > 0);
    assert.ok(result.width >= 1024);
    assert.ok(result.height >= 572);
    assert.ok(Math.abs((result.width / result.height) - (16 / 9)) < 0.02);
    media.push({ name: project.name, source: project.video.url, ...result });
  }
  console.log(JSON.stringify({ ok: true, thumbnailsUnchanged: true, media }, null, 2));
} finally {
  await browser.close();
}
