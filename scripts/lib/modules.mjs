// A native tab's module, looked at from Node: WebAssembly, and importing only what Hangar gives.
//
// The manifest check (manifest.mjs) restates manifest.rs, which knows where a module is and how
// large it may be, and nothing of its bytes. Hangar reads those when it opens the tab:
// crates/hangar-kit-host/src/runtime.rs compiles the module, then holds it to the ABI. This is the
// cheap part of that, which needs no engine: the file starts like a WebAssembly module, and its
// import section names only `hangar.log` and `hangar.now`, as functions. The words are the
// runtime's, so that a kit author reads the same reason in CI as in the tab.
//
// What it does not look at, and the runtime does: the types of those two functions, the exports
// (`memory`, `hangar_abi_version`, `hangar_alloc`, `hangar_init`, `hangar_update`, `hangar_view`, with
// their types), the ABI's number, and the features the engine refuses (threads, shared memory, 64-bit
// memory, several memories). A kit's own tests can ask the engine for those: `new WebAssembly.Module`.
// The import section is read by hand, and not by `new WebAssembly.Module` here, so that a module
// built with a feature Node's engine does not know yet is not refused by this one.

import fs from "node:fs";
import path from "node:path";

/** What a module may import: the module `hangar` and these two functions. */
export const IMPORT_MODULE = "hangar";
export const IMPORTS = ["log", "now"];

/** Past this many findings in one module, the rest is counted rather than listed. */
const LISTED = 5;

const KINDS = ["function", "table", "memory", "global", "tag"];
const hex = (bytes) => [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join(" ");

/** Thrown by the reader when the bytes stop making sense. */
class Unreadable extends Error {}

class Reader {
  constructor(bytes, at = 0, end = bytes.length) {
    this.bytes = bytes;
    this.at = at;
    this.end = end;
  }

  byte() {
    if (this.at >= this.end) throw new Unreadable("it ends in the middle of a section");
    return this.bytes[this.at++];
  }

  /** An unsigned LEB128 number, of up to 64 bits: exact up to 2^53, which is all a size needs. */
  number() {
    let value = 0;
    for (let index = 0; index < 10; index++) {
      const byte = this.byte();
      value += (byte & 0x7f) * 2 ** (7 * index);
      if ((byte & 0x80) === 0) return value;
    }
    throw new Unreadable("a number in it is longer than 64 bits");
  }

  name() {
    const length = this.number();
    if (length > this.end - this.at) throw new Unreadable("it ends in the middle of a name");
    const text = this.bytes.toString("utf8", this.at, this.at + length);
    this.at += length;
    return text;
  }
}

/** The value type of a global or a table, which is one byte, or a reference with a heap type after it. */
function valueType(reader) {
  const byte = reader.byte();
  if (byte === 0x63 || byte === 0x64) reader.number();
}

function limits(reader) {
  const flags = reader.byte();
  reader.number();
  if (flags & 0x01) reader.number();
  if (flags & 0x08) reader.number();
}

/**
 * What the import section of a module names, as `{ module, name, kind }`. `problem` is why the
 * bytes could not be read to the end, or why they are no module; `imports` then holds what was
 * read before that.
 */
export function importsOf(input) {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input);
  if (bytes.length < 4 || bytes[0] !== 0x00 || bytes[1] !== 0x61 || bytes[2] !== 0x73 || bytes[3] !== 0x6d) {
    return { imports: [], problem: `is not a WebAssembly module: it does not start with the bytes ${hex([0x00, 0x61, 0x73, 0x6d])}` };
  }
  if (bytes.length < 8) return { imports: [], problem: "is not a complete WebAssembly module: its header of 8 bytes is cut short" };
  const version = bytes.subarray(4, 8);
  // A component has the magic of a module, then its version and a layer of 1.
  if (version[2] === 1 && version[3] === 0) {
    return { imports: [], problem: "is a WebAssembly component, not a module: Hangar runs a core module, which wasm32-unknown-unknown builds" };
  }
  if (version[0] !== 1 || version[1] !== 0 || version[2] !== 0 || version[3] !== 0) {
    return { imports: [], problem: `is a WebAssembly module of binary version ${hex(version)}, and Hangar reads ${hex([1, 0, 0, 0])}` };
  }
  const imports = [];
  try {
    let at = 8;
    while (at < bytes.length) {
      const reader = new Reader(bytes, at);
      const id = reader.byte();
      const size = reader.number();
      const end = reader.at + size;
      if (end > bytes.length) throw new Unreadable("a section runs past the end of the file");
      if (id === 2) {
        readImports(new Reader(bytes, reader.at, end), imports);
        break;
      }
      at = end;
    }
  } catch (error) {
    if (!(error instanceof Unreadable)) throw error;
    return { imports, problem: `is not a WebAssembly module whose imports can be read: ${error.message}` };
  }
  return { imports };
}

function readImports(reader, imports) {
  const count = reader.number();
  for (let index = 0; index < count; index++) {
    const module = reader.name();
    const name = reader.name();
    const code = reader.byte();
    if (code > 4) throw new Unreadable(`an import of kind ${code} is none that WebAssembly has`);
    imports.push({ module, name, kind: KINDS[code] });
    if (code === 0) reader.number();
    else if (code === 1) {
      valueType(reader);
      limits(reader);
    } else if (code === 2) limits(reader);
    else if (code === 3) {
      valueType(reader);
      reader.byte();
    } else {
      reader.byte();
      reader.number();
    }
  }
}

/** Why Hangar does not give this import, in the words the runtime uses. */
function refusal({ module, name }) {
  if (module === "wasi_snapshot_preview1" || module.startsWith("wasi")) {
    return `imports ${module}::${name}: it was built for WASI. Build it for wasm32-unknown-unknown, where Hangar gives what a tab needs`;
  }
  if (module.startsWith("__wbindgen") || module === "wbg") {
    return `imports ${module}::${name}: it was built with wasm-bindgen, for a browser. A native tab needs no JavaScript glue`;
  }
  return `imports ${module}::${name}, which Hangar does not give: only hangar::log and hangar::now`;
}

/** What is wrong with a module's bytes, each as `what it is`; `[]` for a module Hangar may load. */
export function bytesProblems(bytes) {
  const { imports, problem } = importsOf(bytes);
  const wrong = imports.filter(({ module, name, kind }) => !(module === IMPORT_MODULE && IMPORTS.includes(name) && kind === "function"));
  const found = wrong.slice(0, LISTED).map(refusal);
  if (wrong.length > LISTED) found.push(`and ${wrong.length - LISTED} more imports Hangar does not give`);
  if (problem) found.push(problem);
  return found;
}

/**
 * Every problem of the modules the manifest names (`modules`, from parseManifest: the manifest's
 * own check has said they are there, inside the kit and not too large), each module once, by
 * its path in the kit.
 */
export function checkModules(root, modules) {
  const problems = [];
  const seen = new Set();
  for (const { path: relative } of modules) {
    if (seen.has(relative)) continue;
    seen.add(relative);
    let bytes;
    try {
      bytes = fs.readFileSync(path.join(root, relative));
    } catch (error) {
      problems.push(`${relative}: could not be read (${error.code ?? "error"})`);
      continue;
    }
    for (const problem of bytesProblems(bytes)) problems.push(`${relative}: ${problem}`);
  }
  return problems;
}
