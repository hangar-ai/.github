// A native tab's module: WebAssembly, importing only hangar.log and hangar.now. The reader is
// written by hand, so it is compared with an engine's on every module that is valid.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { bytesProblems, checkModules, importsOf } from "../scripts/lib/modules.mjs";
import { kitFolder } from "./kit-folder.mjs";
import { FUNC, GLOBAL, HEADER, MEMORY, TABLE, section, wasm } from "./wasm-bytes.mjs";

const GIVEN = [["hangar", "log"], ["hangar", "now"]];
const REFUSED_NOW = "imports hangar::now, which Hangar does not give: only hangar::log and hangar::now";

test("a module that imports hangar.log and hangar.now, or nothing, is loaded", () => {
  assert.deepEqual(bytesProblems(wasm(GIVEN)), []);
  assert.deepEqual(bytesProblems(wasm([["hangar", "now"]])), []);
  assert.deepEqual(bytesProblems(wasm([])), []);
  assert.deepEqual(bytesProblems(wasm(GIVEN, { custom: ["name", "producers", "target_features"] })), [], "custom sections before and after are skipped");
});

test("what it is that is not a module", () => {
  assert.deepEqual(bytesProblems(Buffer.alloc(0)), ["is not a WebAssembly module: it does not start with the bytes 00 61 73 6d"]);
  assert.deepEqual(bytesProblems(Buffer.from("\x89PNG\r\n\x1a\n")), ["is not a WebAssembly module: it does not start with the bytes 00 61 73 6d"]);
  assert.deepEqual(bytesProblems(Buffer.from("(module)")), ["is not a WebAssembly module: it does not start with the bytes 00 61 73 6d"]);
  // The four bytes of the magic alone are what the manifest's own tests stand a module in with.
  assert.deepEqual(bytesProblems(Buffer.from("\0asm")), ["is not a complete WebAssembly module: its header of 8 bytes is cut short"]);
  assert.deepEqual(bytesProblems(Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00])), ["is not a complete WebAssembly module: its header of 8 bytes is cut short"]);
  assert.deepEqual(bytesProblems(Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x02, 0x00, 0x00, 0x00])), ["is a WebAssembly module of binary version 02 00 00 00, and Hangar reads 01 00 00 00"]);
  assert.deepEqual(bytesProblems(Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x0d, 0x00, 0x01, 0x00])), ["is a WebAssembly component, not a module: Hangar runs a core module, which wasm32-unknown-unknown builds"]);
  assert.deepEqual(bytesProblems(Buffer.from(HEADER)), [], "a header and nothing else is an empty module");
});

test("a module built for WASI, for a browser, or for another host is refused in the runtime's words", () => {
  assert.deepEqual(bytesProblems(wasm([["wasi_snapshot_preview1", "fd_write"]])), ["imports wasi_snapshot_preview1::fd_write: it was built for WASI. Build it for wasm32-unknown-unknown, where Hangar gives what a tab needs"]);
  assert.deepEqual(bytesProblems(wasm([["wasi:cli/stdout", "get-stdout"]])), ["imports wasi:cli/stdout::get-stdout: it was built for WASI. Build it for wasm32-unknown-unknown, where Hangar gives what a tab needs"]);
  assert.deepEqual(bytesProblems(wasm([["__wbindgen_placeholder__", "__wbindgen_throw"]])), ["imports __wbindgen_placeholder__::__wbindgen_throw: it was built with wasm-bindgen, for a browser. A native tab needs no JavaScript glue"]);
  assert.deepEqual(bytesProblems(wasm([["wbg", "__wbg_log_1"]])), ["imports wbg::__wbg_log_1: it was built with wasm-bindgen, for a browser. A native tab needs no JavaScript glue"]);
  assert.deepEqual(bytesProblems(wasm([["env", "abort"]])), ["imports env::abort, which Hangar does not give: only hangar::log and hangar::now"]);
  assert.deepEqual(bytesProblems(wasm([["hangar", "random"]])), ["imports hangar::random, which Hangar does not give: only hangar::log and hangar::now"]);
  assert.deepEqual(bytesProblems(wasm([["Hangar", "log"]])), ["imports Hangar::log, which Hangar does not give: only hangar::log and hangar::now"]);
});

test("the two imports are functions, and a memory, a table or a global of that name is not given", () => {
  assert.deepEqual(bytesProblems(wasm([["hangar", "now", MEMORY]])), [REFUSED_NOW]);
  assert.deepEqual(bytesProblems(wasm([["hangar", "now", TABLE]])), [REFUSED_NOW]);
  assert.deepEqual(bytesProblems(wasm([["hangar", "now", GLOBAL]])), [REFUSED_NOW]);
  assert.deepEqual(bytesProblems(wasm([["env", "memory", MEMORY]])), ["imports env::memory, which Hangar does not give: only hangar::log and hangar::now"]);
});

test("every import that is not given is told, in order, up to five", () => {
  const strangers = ["a", "b", "c", "d", "e", "f", "g"].map((field) => ["wasi_snapshot_preview1", field]);
  assert.deepEqual(bytesProblems(wasm([["hangar", "log"], ["env", "x"], ["hangar", "now"], ["env", "y"]])), [
    "imports env::x, which Hangar does not give: only hangar::log and hangar::now",
    "imports env::y, which Hangar does not give: only hangar::log and hangar::now",
  ]);
  const found = bytesProblems(wasm(strangers));
  assert.equal(found.length, 6);
  assert.match(found[0], /^imports wasi_snapshot_preview1::a: /);
  assert.match(found[4], /^imports wasi_snapshot_preview1::e: /);
  assert.equal(found[5], "and 2 more imports Hangar does not give");
});

test("imports of every kind are stepped over to the next, and long names and numbers are read", () => {
  const long = "x".repeat(300);
  const imports = [
    ["env", "memory", MEMORY],
    ["env", "table", TABLE],
    ["env", "global", GLOBAL],
    ["env", "bounded", [0x02, 0x01, 0x01, 0x80, 0x01]],
    ["env", "shared", [0x02, 0x03, 0x01, 0x10]],
    ["env", "huge", [0x02, 0x04, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x01]],
    ["env", "ref", [0x03, 0x63, 0x70, 0x00]],
    ["env", "tag", [0x04, 0x00, 0x00]],
    [long, long, FUNC],
    ["hangar", "log"],
  ];
  const { imports: read, problem } = importsOf(wasm(imports));
  assert.equal(problem, undefined);
  assert.deepEqual(
    read.map(({ module, name, kind }) => `${module.slice(0, 6)}.${name.slice(0, 6)} ${kind}`),
    ["env.memory memory", "env.table table", "env.global global", "env.bounde memory", "env.shared memory", "env.huge memory", "env.ref global", "env.tag tag", "xxxxxx.xxxxxx function", "hangar.log function"],
  );
});

test("an import section that stops short says so, after what it did read", () => {
  const whole = wasm([["env", "x"], ["hangar", "log"]]);
  // Cut inside the second import: the section's size then runs past the end.
  const cut = whole.subarray(0, whole.indexOf(Buffer.from("hangar")) + 3);
  assert.deepEqual(bytesProblems(cut), ["is not a WebAssembly module whose imports can be read: a section runs past the end of the file"]);
  // A section that is the right size but holds half an import.
  const half = Buffer.from([...HEADER, ...section(2, [1, 3, 0x65, 0x6e, 0x76, 1, 0x78])]);
  assert.deepEqual(bytesProblems(half), ["is not a WebAssembly module whose imports can be read: it ends in the middle of a section"]);
  const several = Buffer.from([...HEADER, ...section(2, [3, 3, 0x65, 0x6e, 0x76, 1, 0x78, 0x00, 0x00, 1])]);
  const found = bytesProblems(several);
  assert.equal(found[0], "imports env::x, which Hangar does not give: only hangar::log and hangar::now");
  assert.match(found[1], /^is not a WebAssembly module whose imports can be read: /);
  assert.deepEqual(bytesProblems(Buffer.from([...HEADER, ...section(2, [1, 0x01, 0x61, 0x01, 0x62, 0x09])])), ["is not a WebAssembly module whose imports can be read: an import of kind 9 is none that WebAssembly has"]);
  assert.deepEqual(bytesProblems(Buffer.from([...HEADER, 0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x01])), ["is not a WebAssembly module whose imports can be read: a number in it is longer than 64 bits"]);
});

test("the hand-written reader reads what an engine reads", () => {
  const modules = [
    wasm([]),
    wasm(GIVEN),
    wasm([["wasi_snapshot_preview1", "fd_write"], ["hangar", "log"], ["env", "memory", MEMORY], ["env", "t", TABLE], ["env", "g", GLOBAL], ["é", "ü", FUNC]], { custom: ["name"] }),
    wasm([["hangar", "now", [0x02, 0x03, 0x01, 0x10]]]),
  ];
  const kinds = { function: "function", table: "table", memory: "memory", global: "global" };
  for (const bytes of modules) {
    const engine = WebAssembly.Module.imports(new WebAssembly.Module(bytes)).map(({ module, name, kind }) => ({ module, name, kind: kinds[kind] }));
    assert.deepEqual(importsOf(bytes).imports, engine);
  }
});

test("a kit's modules are each read once, by their path, and a missing one is told", () => {
  const root = kitFolder({ "tabs/good.wasm": wasm(GIVEN), "tabs/wasi.wasm": wasm([["wasi_snapshot_preview1", "fd_write"]]), "tabs/fake.wasm": "<html>", "stub.wasm": "\0asm" });
  try {
    const named = (path, at = "tabs[0].entry") => ({ at, path });
    assert.deepEqual(checkModules(root, [named("tabs/good.wasm")]), []);
    assert.deepEqual(checkModules(root, []), []);
    assert.deepEqual(checkModules(root, [named("tabs/wasi.wasm"), named("tabs/wasi.wasm", "tabs[1].native"), named("tabs/fake.wasm"), named("stub.wasm")]), [
      "tabs/wasi.wasm: imports wasi_snapshot_preview1::fd_write: it was built for WASI. Build it for wasm32-unknown-unknown, where Hangar gives what a tab needs",
      "tabs/fake.wasm: is not a WebAssembly module: it does not start with the bytes 00 61 73 6d",
      "stub.wasm: is not a complete WebAssembly module: its header of 8 bytes is cut short",
    ]);
    assert.deepEqual(checkModules(root, [named("tabs/gone.wasm")]), ["tabs/gone.wasm: could not be read (ENOENT)"]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
