#!/usr/bin/env node
// Renders the org's images from brand/src with a browser already on the machine, in headless mode
// and with a throwaway profile. One browser at a time. BROWSER names another one.
//
//   node brand/render.mjs [avatar|banner|social]
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const IMAGES = { avatar: [500, 500], banner: [1280, 320], social: [1280, 640] };
const browser =
  process.env.BROWSER ??
  [
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/chromium",
    "/usr/bin/google-chrome",
  ].find((file) => fs.existsSync(file));
if (!browser) throw new Error("no browser found: set BROWSER");

const wanted = process.argv.slice(2);
for (const [name, [width, height]] of Object.entries(IMAGES)) {
  if (wanted.length && !wanted.includes(name)) continue;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "brand-"));
  try {
    execFileSync(
      browser,
      [
        "--headless=new",
        "--disable-gpu",
        "--hide-scrollbars",
        "--no-first-run",
        "--force-device-scale-factor=1",
        `--user-data-dir=${profile}`,
        `--window-size=${width},${height}`,
        "--virtual-time-budget=2000",
        `--screenshot=${path.join(here, `${name}.png`)}`,
        pathToFileURL(path.join(here, "src", `${name}.html`)).href,
      ],
      { stdio: "ignore" },
    );
  } finally {
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
  console.log(`${name}.png`);
}
