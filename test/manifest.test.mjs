// Runs the JavaScript restatement on the cases of Hangar's own Rust tests.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { parseManifest, placeholders } from "../scripts/lib/manifest.mjs";
import { cases, judge } from "./manifest-fixtures.mjs";
import { kitFolder } from "./kit-folder.mjs";

for (const fixture of cases) {
  test(fixture.name, () => {
    const root = kitFolder(fixture.files);
    try {
      const text = fixture.raw ?? (fixture.bom ? "﻿" : "") + JSON.stringify(fixture.manifest);
      const why = judge(fixture.expect, parseManifest(text, root).problems.join("; "));
      assert.equal(why, null);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

test("a placeholder is a name in braces, and other braces are text", () => {
  assert.deepEqual(placeholders("{run}"), ["run"]);
  assert.deepEqual(placeholders("--repo={repo}"), ["repo"]);
  assert.deepEqual(placeholders("{owner}/{repo}.git"), ["owner", "repo"]);
  for (const text of ["plain", "", "{{.Names}}", "{{json .}}", "{}", "{", "{a", "{1a}"]) assert.deepEqual(placeholders(text), [], text);
  assert.deepEqual(placeholders("{{a}}"), ["a"]);
  assert.deepEqual(placeholders("é{a_b-c}é"), ["a_b-c"]);
});

test("stricter than Rust on purpose: a blank id and a blank version", () => {
  const root = kitFolder({});
  try {
    const manifest = { schema: 1, id: "", name: "N", version: "", description: "" };
    const problems = parseManifest(JSON.stringify(manifest), root).problems.join("; ");
    assert.match(problems, /^id: /);
    assert.match(problems, /version: /);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

const nativeKit = (schema, tab) => ({
  schema,
  id: "roblox",
  name: "T",
  version: "1.0.0",
  description: "d",
  tabs: [{ id: "t", title: "T", permissions: [], ...tab }],
});

test("the modules a manifest names come back normalized, once they have passed", () => {
  const root = kitFolder({ "tabs/hello.wasm": "\0asm", "tabs/ci/index.html": "", "tabs/ci.wasm": "\0asm" });
  try {
    const read = (manifest) => parseManifest(JSON.stringify(manifest), root);
    assert.deepEqual(read(nativeKit(2, { entry: "./tabs\\\\hello.wasm" })).modules, [{ at: "tabs[0].entry", path: "tabs/hello.wasm" }]);
    assert.deepEqual(read(nativeKit(1, { entry: "tabs/ci/index.html", native: "tabs\\ci.wasm" })).modules, [{ at: "tabs[0].native", path: "tabs/ci.wasm" }]);
    assert.deepEqual(read(nativeKit(2, { entry: "tabs/ci/index.html" })).modules, []);
    // A module the rules refuse is not one to look inside.
    assert.deepEqual(read(nativeKit(1, { entry: "tabs/hello.wasm" })).modules, []);
    assert.deepEqual(read(nativeKit(2, { entry: "tabs/ci/index.html", native: "tabs/missing.wasm" })).modules, []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("a module is the file the folder holds, in the case the filesystem says", () => {
  // Rust's test: `Hello.WASM` is a module in any case, and the same file as `hello.wasm` only
  // where the filesystem says so (not on Linux; on Windows and a Mac's usual volume, yes).
  const root = kitFolder({ "tabs/hello.wasm": "\0asm" });
  try {
    const problems = parseManifest(JSON.stringify(nativeKit(2, { entry: "tabs\\.\\Hello.WASM" })), root).problems;
    if (fs.existsSync(path.join(root, "tabs", "Hello.WASM"))) assert.deepEqual(problems, []);
    else assert.deepEqual(problems, ["tabs[0].entry: not found in the kit folder"]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("a symlinked module out of the kit is refused", (t) => {
  const root = kitFolder({ "t.html": "" });
  const outside = kitFolder({ "tab.wasm": "\0asm" });
  try {
    try {
      // A junction on Windows, where a symlink asks for a privilege; the type is ignored elsewhere.
      fs.symlinkSync(outside, path.join(root, "web"), "junction");
    } catch (error) {
      return t.skip(`no symlink here: ${error.code}`);
    }
    for (const [tab, at] of [
      [{ entry: "web/tab.wasm" }, "entry"],
      [{ entry: "t.html", native: "web/tab.wasm" }, "native"],
    ]) {
      assert.deepEqual(parseManifest(JSON.stringify(nativeKit(2, tab)), root).problems, [`tabs[0].${at}: leads outside the kit folder`]);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});
