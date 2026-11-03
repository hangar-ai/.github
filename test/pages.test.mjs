// Which files of a kit the pages check reads, and that a native tab's module is not one of them.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { checkPages, tabFiles } from "../scripts/lib/pages.mjs";
import { kitFolder } from "./kit-folder.mjs";
import { wasm } from "./wasm-bytes.mjs";

const relative = (root, files) => files.map((file) => path.relative(root, file).replaceAll("\\", "/")).sort();
const tab = (entry, more = {}) => ({ id: "t", title: "T", entry, permissions: [], ...more });
const withKit = (files, body) => {
  const root = kitFolder(files);
  try {
    return body(fs.realpathSync(root));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
};

test("a native tab has no page: the folder of its module is not read for pages", () => {
  withKit({ "build/panes.wasm": wasm(), "build/glue.js": "fetch('https://example.com')", "build/look.css": "a{color:#fff}" }, (root) => {
    const manifest = { schema: 2, tabs: [tab("build/panes.wasm")] };
    assert.deepEqual(tabFiles(root, manifest), []);
    assert.deepEqual(checkPages(root, manifest), []);
  });
});

test("a native tab in tabs/ leaves the module, and reads what is a page", () => {
  withKit({ "tabs/panes.wasm": wasm(), "tabs/old/index.html": "<!doctype html>" }, (root) => {
    const manifest = { schema: 2, tabs: [tab("tabs/panes.wasm")] };
    assert.deepEqual(relative(root, tabFiles(root, manifest)), ["tabs/old/index.html", "tabs/panes.wasm"]);
    assert.deepEqual(checkPages(root, manifest), []);
  });
});

test("a page keeps its checks beside a module, in either schema", () => {
  const files = { "tabs/panes/index.html": '<link rel="stylesheet" href="https://example.com/x.css">', "tabs/panes.wasm": wasm(), "tabs/ci.wasm": wasm() };
  withKit(files, (root) => {
    // schema 1: the module beside the page; schema 2: a tab of each kind.
    for (const manifest of [
      { schema: 1, tabs: [tab("tabs/panes/index.html", { native: "tabs/panes.wasm" })] },
      { schema: 2, tabs: [tab("tabs/panes/index.html", { native: "tabs/panes.wasm" })] },
      { schema: 2, tabs: [tab("tabs/panes/index.html"), tab("tabs/ci.wasm", { id: "ci" })] },
    ]) {
      assert.deepEqual(checkPages(root, manifest), ["tabs/panes/index.html: <link> https://example.com/x.css is outside the kit"]);
    }
  });
});

test("a page and a module at the root of the kit", () => {
  withKit({ "index.html": "<!doctype html>", "panes.wasm": wasm() }, (root) => {
    const manifest = { schema: 2, tabs: [tab("index.html"), tab("panes.wasm", { id: "p" }), { id: "broken" }, tab(3, { id: "number" })] };
    assert.deepEqual(relative(root, tabFiles(root, manifest)), ["index.html"]);
    assert.deepEqual(checkPages(root, manifest), []);
  });
});

test("an entry that leaves the kit reads nothing outside it", () => {
  withKit({ "kit/ok.html": "<!doctype html>", "outside/page.html": "<p style='color:red'>", "outside/x.js": "fetch('x')" }, (parent) => {
    const root = path.join(parent, "kit");
    for (const entry of ["../outside/page.html", "../outside/x.wasm", "..\\outside\\page.html"]) {
      assert.deepEqual(relative(root, tabFiles(root, { schema: 2, tabs: [tab(entry)] })), [], entry);
    }
    assert.deepEqual(relative(root, tabFiles(root, { schema: 1, tabs: [tab("ok.html"), tab("../outside/page.html")] })), ["ok.html"]);
  });
});

test("an entry that is the kit itself reads nothing outside it", () => {
  withKit({ "kit/ok.html": "<!doctype html>", "outside/page.html": "" }, (parent) => {
    const root = path.join(parent, "kit");
    for (const entry of [".", "", "./", "sub/.."]) assert.deepEqual(relative(root, tabFiles(root, { schema: 1, tabs: [tab(entry)] })), [], JSON.stringify(entry));
  });
});
