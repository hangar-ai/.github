#!/usr/bin/env node
// Gets Hangar's own files that a kit's tests compare against: Hangar UI and the kit docs. They are
// Hangar's, so a kit repository does not hold a copy; they are read at a pinned tag, the oldest
// Hangar the kit says it works with, because a class must exist there to be safe to use.
//
//   node scripts/fetch-hangar-ui.mjs --kit <folder> --out <folder> [--ref v1.9.0] [--checkout <hangar>]
//
// --checkout reads a local Hangar checkout's working tree instead of GitHub.
//
// When the tag does not exist yet, or holds no Hangar UI, this warns and leaves the folder absent:
// the tests that need these files skip, and say so. Any other failure is a failure.

import fs from "node:fs";
import path from "node:path";

const REPOSITORY = "simnJS/hangar-ai";
export const FILES = {
  "kit.css": "src-tauri/kit-sdk/kit.css",
  "kit.js": "src-tauri/kit-sdk/kit.js",
  "kit-ui.js": "src-tauri/kit-sdk/kit-ui.js",
  "inter.woff2": "src-tauri/kit-sdk/inter.woff2",
  "kits.md": "docs/kits.md",
  "kit-ui.md": "docs/kit-ui.md",
};

function option(name) {
  const at = process.argv.indexOf(name);
  return at > 0 ? process.argv[at + 1] : undefined;
}

function refOf(kit) {
  const given = option("--ref");
  if (given) return given;
  const manifest = JSON.parse(fs.readFileSync(path.join(kit, "hangar-kit.json"), "utf8").replace(/^﻿/, ""));
  const match = typeof manifest.hangar === "string" ? manifest.hangar.match(/(\d+\.\d+\.\d+)/) : null;
  return match ? `v${match[1]}` : null;
}

function warn(message) {
  console.log(process.env.GITHUB_ACTIONS === "true" ? `::warning title=Hangar UI not checked::${message}` : `warning: ${message}`);
}

function publish(out) {
  if (process.env.GITHUB_ENV) fs.appendFileSync(process.env.GITHUB_ENV, `HANGAR_UI_DIR=${out}\n`);
}

async function main() {
  const kit = option("--kit") ?? ".";
  const out = path.resolve(option("--out") ?? path.join(kit, ".hangar-ui"));
  const checkout = option("--checkout");
  const ref = refOf(kit);
  if (!ref && !checkout) {
    warn("the manifest has no `hangar` requirement to read a tag from: the tests that compare against Hangar UI are skipped.");
    return 0;
  }
  fs.mkdirSync(out, { recursive: true });
  if (checkout) {
    for (const [name, source] of Object.entries(FILES)) fs.copyFileSync(path.join(checkout, source), path.join(out, name));
    console.log(`Hangar UI and docs copied from a checkout into ${out}`);
    publish(out);
    return 0;
  }
  for (const [name, source] of Object.entries(FILES)) {
    const url = `https://raw.githubusercontent.com/${REPOSITORY}/${ref}/${source}`;
    const answer = await fetch(url);
    if (answer.status === 404) {
      fs.rmSync(out, { recursive: true, force: true });
      warn(`Hangar ${ref} is not tagged yet, or holds no ${source}: the tests that compare against Hangar UI and the docs are skipped.`);
      return 0;
    }
    if (!answer.ok) throw new Error(`${url} answered ${answer.status}`);
    fs.writeFileSync(path.join(out, name), Buffer.from(await answer.arrayBuffer()));
  }
  console.log(`Hangar UI and docs of ${ref} are in ${out}`);
  publish(out);
  return 0;
}

process.exitCode = await main().catch((error) => {
  console.error(error.message);
  return 1;
});
