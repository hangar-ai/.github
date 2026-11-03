#!/usr/bin/env node
// What every kit of the org passes before it reaches the gallery. No dependency: Node alone.
//
//   node scripts/kit-check.mjs <kit folder> [--also <text>]...
//
// --also names a string that is yours and must appear nowhere (your name, your machine's). It is
// given on the command line so that it is never written down in a repository.
//
// The tests are not run from here: the workflow runs `node --test` in the kit, once per OS.
//
// Everything about the manifest restates Hangar's Rust validator; see scripts/lib/manifest.mjs for
// what that means and where it can differ. It reads schemas 1 and 2: schema 2 is for native tabs,
// whose `entry` is a WebAssembly module and not a page, and a schema-1 tab may carry its module
// in `native`. A module is looked into (scripts/lib/modules.mjs); a page is linted as it always was.

import fs from "node:fs";
import path from "node:path";
import { readManifest } from "./lib/manifest.mjs";
import { authorEmails, scanFiles, scanHistory } from "./lib/personal.mjs";
import { checkPages } from "./lib/pages.mjs";
import { checkModules } from "./lib/modules.mjs";

/** Hangar's gallery drops an entry past these: src-tauri/src/kits/gallery.rs. */
const MAX_TAGS = 8;

function argumentsOf(argv) {
  const also = [];
  let folder;
  for (let index = 0; index < argv.length; index++) {
    if (argv[index] === "--also") also.push(argv[++index]);
    else folder = argv[index];
  }
  return { folder, also };
}

function galleryProblems(manifest) {
  const gallery = manifest?.gallery;
  if (gallery === null || typeof gallery !== "object" || Array.isArray(gallery)) return ['gallery: is missing (it needs permissionsSummary and tags, for the card)'];
  const problems = [];
  if (typeof gallery.permissionsSummary !== "string" || gallery.permissionsSummary.trim() === "") problems.push("gallery.permissionsSummary: one sentence saying what the kit runs and touches");
  const tags = gallery.tags;
  if (!Array.isArray(tags) || tags.length === 0 || tags.some((tag) => typeof tag !== "string" || tag.trim() === "")) problems.push("gallery.tags: a list of non-empty strings");
  else if (tags.length > MAX_TAGS) problems.push(`gallery.tags: ${MAX_TAGS} at most`);
  return problems;
}

function pluginProblems(root, manifest) {
  if (typeof manifest?.id !== "string") return [];
  const relative = typeof manifest.plugin === "string" ? manifest.plugin : ".";
  const file = path.join(root, relative, ".claude-plugin", "plugin.json");
  if (!fs.existsSync(file)) return [];
  try {
    const plugin = JSON.parse(fs.readFileSync(file, "utf8").replace(/^﻿/, ""));
    return plugin.name === manifest.id ? [] : [`.claude-plugin/plugin.json: name it like the kit, "${manifest.id}": the name prefixes its skills and its MCP tools`];
  } catch (error) {
    return [`.claude-plugin/plugin.json: not valid JSON (${error.message})`];
  }
}

function shapeProblems(root) {
  const problems = [];
  if (!fs.existsSync(path.join(root, "README.md"))) problems.push("README.md: a kit says what it does and what it touches");
  if (!fs.existsSync(path.join(root, "LICENSE"))) problems.push("LICENSE: a kit others run says on what terms");
  return problems;
}

function allowList(root) {
  const file = path.join(root, ".kit-check.json");
  if (!fs.existsSync(file)) return { allow: [], problems: [] };
  try {
    const allow = JSON.parse(fs.readFileSync(file, "utf8")).personalData?.allow ?? [];
    const problems = allow.filter((rule) => typeof rule.path !== "string" || typeof rule.why !== "string" || !rule.why.trim()).map(() => ".kit-check.json: each exception names a path and says why");
    return { allow, problems };
  } catch (error) {
    return { allow: [], problems: [`.kit-check.json: not valid JSON (${error.message})`] };
  }
}

const inActions = process.env.GITHUB_ACTIONS === "true";

function report(title, problems, notes = []) {
  const passed = problems.length === 0;
  console.log(`${passed ? "ok  " : "FAIL"} ${title}`);
  for (const note of notes) console.log(`     ${note}`);
  for (const problem of problems) {
    console.log(`     ${problem}`);
    if (inActions) console.log(`::error title=${title}::${problem}`);
  }
  return passed;
}

function main() {
  const { folder, also } = argumentsOf(process.argv.slice(2));
  if (!folder) {
    console.error("usage: node kit-check.mjs <kit folder> [--also <text>]...");
    return 2;
  }
  const root = path.resolve(folder);
  const { problems: manifestProblems, manifest, modules = [] } = readManifest(root);
  const results = [];

  results.push(report("the manifest, by the rules of Hangar's validator", manifestProblems));
  results.push(report("its card for the gallery", manifest ? galleryProblems(manifest) : ["no manifest to read"]));
  results.push(report("its plugin, named like the kit", pluginProblems(root, manifest)));
  results.push(report("a README and a licence", shapeProblems(root)));
  results.push(report("its pages: no colour of their own, nothing from outside the kit", manifest ? checkPages(root, manifest) : []));
  // Only a kit with a native tab has this line: a kit of pages is checked, and reports, as it was.
  if (modules.length > 0) results.push(report("its native modules: WebAssembly that imports only hangar.log and hangar.now", checkModules(fs.realpathSync(root), modules)));

  const { allow, problems: allowProblems } = allowList(root);
  const excuses = allow.map((rule) => `excused in ${rule.path}${rule.kinds ? ` (${rule.kinds.join(", ")})` : ""}: ${rule.why}`);
  const inFiles = scanFiles(root, { allow, extra: also }).map(({ place, kind }) => `${place}: ${kind}`);
  results.push(report("nothing personal in its files", [...allowProblems, ...inFiles], excuses));

  const history = scanHistory(root, { allow, extra: also });
  if (history === null) {
    console.log("skip nothing personal in its history: no git history here, or a shallow clone");
  } else {
    const emails = authorEmails(root);
    results.push(report("nothing personal in its history", history.map(({ place, kind }) => `${place}: ${kind}`), [`commits carry ${emails.length} author identit${emails.length === 1 ? "y" : "ies"}: listed by \`git log --format='%an <%ae>'\`, not refused`]));
  }

  return results.every(Boolean) ? 0 : 1;
}

process.exit(main());
