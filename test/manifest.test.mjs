// Runs the JavaScript restatement on the cases of Hangar's own Rust tests.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseManifest, placeholders } from "../scripts/lib/manifest.mjs";
import { cases, judge } from "./manifest-fixtures.mjs";

function kitFolder(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kit-check-"));
  for (const [relative, body] of Object.entries(files)) {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, body);
  }
  return root;
}

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
