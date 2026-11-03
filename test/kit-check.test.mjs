// kit-check.mjs as a kit's CI runs it, on small kits made for the purpose.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { kitFolder } from "./kit-folder.mjs";
import { wasm } from "./wasm-bytes.mjs";

const SCRIPT = fileURLToPath(new URL("../scripts/kit-check.mjs", import.meta.url));

const manifest = (schema, tabs) => ({
  schema,
  id: "sample-kit",
  name: "Sample kit",
  version: "0.1.0",
  description: "A kit made for a test.",
  hangar: ">=1.12.1",
  gallery: { permissionsSummary: "Shows a tab. Runs nothing.", tags: ["example"] },
  tabs,
});
const GOOD = wasm([["hangar", "log"], ["hangar", "now"]]);
const PAGE = '<!doctype html><link rel="stylesheet" href="/_hangar/kit.css"><p class="kit-text">Hello</p>';

/** What kit-check says of a kit, outside GitHub Actions, so that a finding is not an annotation. */
function check(files, body) {
  const root = kitFolder({ "README.md": "# Sample\n", LICENSE: "MIT\n", ...files });
  try {
    const { status, stdout, stderr } = spawnSync(process.execPath, [SCRIPT, root], { encoding: "utf8", env: { ...process.env, GITHUB_ACTIONS: "" } });
    return body({ status, stdout, stderr, root });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

const tab = (entry, more = {}) => ({ id: "hello", title: "Hello", entry, permissions: ["panes.read"], ...more });

test("a kit of one native tab, under schema 2, passes", () => {
  const files = { "hangar-kit.json": JSON.stringify(manifest(2, [tab("tabs/hello.wasm")])), "tabs/hello.wasm": GOOD };
  check(files, ({ status, stdout }) => {
    assert.equal(status, 0, stdout);
    assert.match(stdout, /^ok {3}the manifest, by the rules of Hangar's validator$/m);
    assert.match(stdout, /^ok {3}its pages: /m);
    assert.match(stdout, /^ok {3}its native modules: WebAssembly that imports only hangar\.log and hangar\.now$/m);
  });
});

test("a native tab on schema 1 needs schema 2, and its module is not looked into until it has one", () => {
  const files = { "hangar-kit.json": JSON.stringify(manifest(1, [tab("tabs/hello.wasm")])), "tabs/hello.wasm": GOOD };
  check(files, ({ status, stdout }) => {
    assert.equal(status, 1);
    assert.match(stdout, /^FAIL the manifest[^\n]*\n {5}tabs\[0\]\.entry: a native tab needs "schema": 2$/m);
    assert.doesNotMatch(stdout, /native modules/);
  });
});

test("a module that is no WebAssembly, or imports what Hangar does not give, fails", () => {
  const files = (module) => ({ "hangar-kit.json": JSON.stringify(manifest(2, [tab("tabs/hello.wasm")])), "tabs/hello.wasm": module });
  check(files(Buffer.from("not a module, a text")), ({ status, stdout }) => {
    assert.equal(status, 1);
    assert.match(stdout, /^FAIL its native modules[^\n]*\n {5}tabs\/hello\.wasm: is not a WebAssembly module: it does not start with the bytes 00 61 73 6d$/m);
    assert.match(stdout, /^ok {3}the manifest/m, "the manifest was right: it does not look inside");
  });
  check(files(wasm([["wasi_snapshot_preview1", "fd_write"], ["hangar", "log"]])), ({ status, stdout }) => {
    assert.equal(status, 1);
    assert.match(stdout, /^ {5}tabs\/hello\.wasm: imports wasi_snapshot_preview1::fd_write: it was built for WASI\./m);
  });
});

test("a schema-1 kit with a module beside its page: the page is linted and the module is looked into", () => {
  const tabs = [tab("tabs/hello/index.html", { native: "tabs/hello.wasm" })];
  const files = (page, module) => ({ "hangar-kit.json": JSON.stringify(manifest(1, tabs)), "tabs/hello/index.html": page, "tabs/hello.wasm": module });
  check(files(PAGE, GOOD), ({ status, stdout }) => {
    assert.equal(status, 0, stdout);
    assert.match(stdout, /^ok {3}its native modules/m);
  });
  check(files(`${PAGE}<style>a{color:#fff}</style>`, GOOD), ({ status, stdout }) => {
    assert.equal(status, 1);
    assert.match(stdout, /^FAIL its pages/m);
    assert.match(stdout, /^ok {3}its native modules/m);
  });
  check(files(PAGE, wasm([["env", "abort"]])), ({ status, stdout }) => {
    assert.equal(status, 1);
    assert.match(stdout, /^ok {3}its pages/m);
    assert.match(stdout, /^FAIL its native modules/m);
  });
});

test("a kit of pages reports as it always did: no line for modules", () => {
  const files = { "hangar-kit.json": JSON.stringify(manifest(1, [tab("tabs/hello/index.html")])), "tabs/hello/index.html": PAGE };
  check(files, ({ status, stdout }) => {
    assert.equal(status, 0, stdout);
    assert.doesNotMatch(stdout, /native modules/);
  });
});
