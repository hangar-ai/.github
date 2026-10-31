#!/usr/bin/env node
// Turns a kit just split out of Hangar's repository into a repository that stands alone.
// Called by split-kit.sh. Edits the working tree and commits nothing.
//
//   node standalone-kit.mjs <kit folder> --id <kit id> --repo <repo name>
//
// It stops and names the file when a test still reaches outside the kit.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { walk } from "../scripts/lib/personal.mjs";
import patches from "./standalone/patches.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const option = (name) => process.argv[process.argv.indexOf(name) + 1];
const root = path.resolve(process.argv[2]);
const id = option("--id");
const repo = option("--repo");
const HOME = `https://github.com/hangar-ai/${repo}`;
const DOCS = "https://github.com/simnJS/hangar-ai/blob/main/docs/";

const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const write = (relative, text) => {
  fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
  fs.writeFileSync(path.join(root, relative), text);
};

function fail(message) {
  console.error(`standalone-kit: ${message}`);
  process.exit(1);
}

// Links and names: this repository instead of Hangar's folder.
const oldHome = new RegExp(`https://github\\.com/simnJS/hangar-ai/tree/main/kits/${id}\\b`, "g");
for (const file of walk(root)) {
  const buffer = fs.readFileSync(path.join(root, file));
  if (buffer.subarray(0, 8192).includes(0)) continue;
  const text = buffer.toString("utf8");
  let next = text.replace(oldHome, HOME);
  if (file.endsWith(".md")) next = next.replace(/\]\((?:\.\.\/)+docs\//g, `](${DOCS}`);
  if (file === "run-tests.js" || file === "package.json") next = next.replace(/node --test kits\/[a-z0-9-]+\/?/g, "node --test .");
  if (file.startsWith("test/") && file.endsWith(".js")) {
    // Their own lists of a person's names are not for a public repository; kit-check looks for the rest.
    next = next
      .replace(/^(\s*const personal = )new RegExp\(\[.*\]\.join\("\|"\), "i"\);$/gm, "$1/[\\w.+-]+@[\\w-]+\\.fr\\b|@gmail\\.com\\b/i;")
      .replace(/simnjs\(\?!\\\/hangar-ai\)\|/g, "")
      .replace(/\|simnjs\\\.fr\|@simnjs/g, "")
      .replace(/\|simnjs\\\.fr/g, "");
  }
  if (next !== text) fs.writeFileSync(path.join(root, file), next);
}

// Kit-specific edits, each of which must still apply.
for (const { file, from, to } of patches[id] ?? []) {
  const text = read(file);
  if (!text.includes(from)) fail(`${file}: the patch for ${id} no longer applies: ${from.slice(0, 60)}`);
  write(file, text.replace(from, to));
}

// Tests: Hangar's files come from test/hangar-ui.js; what cannot have them says so.
const needsHangarFiles = [];
const IMPORT = 'const { hangarFile, HANGAR_FILES_MISSING } = require("./hangar-ui.js");';
for (const file of walk(root).filter((name) => name.startsWith("test/") && name.endsWith(".js"))) {
  const original = read(file);
  const lines = original.split("\n");
  let changed = false;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (/for \(const entry of fs\.readdirSync\(dir, \{ withFileTypes: true \}\)\) \{\s*$/.test(line)) {
      const indent = line.match(/^\s*/)[0] + "  ";
      lines.splice(index + 1, 0, `${indent}if ([".git", ".hangar-ui", "node_modules"].includes(entry.name)) continue;`);
      changed = true;
      continue;
    }
    const match = line.match(/^(\s*)const (\w+) = path\.join\(KIT, "\.\.", "\.\.", (?:"src-tauri", "kit-sdk"|"docs"), "([\w.-]+)"\);\s*$/);
    if (!match) continue;
    const [, indent, name, wanted] = match;
    lines[index] = `${indent}const ${name} = hangarFile("${wanted}");`;
    const guard = lines[index + 1] ?? "";
    if (!new RegExp(`if \\(!fs\\.existsSync\\(${name}\\)\\) return;`).test(guard)) fail(`${file}:${index + 2}: expected the check that ${name} exists`);
    lines[index + 1] = `${indent}if (!${name}) return t.skip(HANGAR_FILES_MISSING);`;
    let at = index;
    while (at >= 0 && !/^test\(/.test(lines[at])) at--;
    const opening = at >= 0 ? lines[at].match(/^test\((["'`])(.*?)\1,\s*(async\s*)?\(\s*\)\s*=>\s*\{/) : null;
    if (!opening && !(at >= 0 && /\(t\)\s*=>\s*\{/.test(lines[at]))) fail(`${file}:${index + 1}: cannot find the test around it`);
    if (opening) {
      lines[at] = lines[at].replace(/\(\s*\)\s*=>\s*\{/, "(t) => {");
      needsHangarFiles.push(opening[2]);
    }
    changed = true;
  }
  if (changed) {
    let text = lines.join("\n");
    if (text.includes("hangarFile(")) {
      const lastRequire = [...text.matchAll(/^const .* = require\(.*\);\n/gm)].pop();
      if (!lastRequire) fail(`${file}: no require to add hangar-ui.js after`);
      const at = lastRequire.index + lastRequire[0].length;
      text = text.slice(0, at) + IMPORT + "\n" + text.slice(at);
    }
    write(file, text);
  }
}

for (const file of walk(root).filter((name) => name.startsWith("test/") && name.endsWith(".js"))) {
  const leaving = read(file).match(/path\.join\((?:KIT(?:, "\.\."){1,}|__dirname(?:, "\.\."){2,})/);
  if (leaving) fail(`${file} still reaches outside the kit: ${leaving[0]}. Add a patch to tools/standalone/patches.mjs.`);
}

// The files every kit repository holds.
const payload = path.join(here, "standalone", "payload");
for (const name of walk(payload)) write(name.replace(/^dot-/, ".").replace(/\/dot-/g, "/."), fs.readFileSync(path.join(payload, name), "utf8"));
if (!needsHangarFiles.length) fs.rmSync(path.join(root, "test", "hangar-ui.js"));

// What Jack sets on GitHub: the description is the manifest's, and the topics its tags.
const manifest = JSON.parse(read("hangar-kit.json"));
const topics = ["hangar-kit", "hangar", "claude-code", ...manifest.gallery.tags.filter((tag) => tag !== "tab")];
write(".github/repo.json", `${JSON.stringify({ description: manifest.description, topics: [...new Set(topics)] }, null, 2)}\n`);

// The README says what happens on its own.
const skipped = needsHangarFiles.length
  ? `Hangar's own files are not in this repository. CI takes Hangar UI and the docs from the Hangar tag the
manifest's \`hangar\` names, and \`node test/hangar-ui.js --get\` does the same here. Without them, these tests
skip what needs those files, and say so:

${[...new Set(needsHangarFiles)].map((title) => `- ${title}`).join("\n")}
`
  : "These tests need nothing from Hangar's repository.\n";
write(
  "README.md",
  `${read("README.md").trimEnd()}

## This repository

\`node --test\` runs the tests, with Node alone. ${skipped}
CI calls [kit-check](https://github.com/hangar-ai/.github/blob/main/.github/workflows/kit-check.yml). A release is
a tag, \`v\` and the manifest's version, and it reaches Hangar's gallery once
[the catalog](https://github.com/hangar-ai/catalog) is updated and reviewed.
`,
);

console.log(`standalone-kit: ${repo} done; ${needsHangarFiles.length} test(s) need Hangar's files.`);
