// `hangar-kit.json`, schema 1, checked from Node.
//
// This file RESTATES the rules of Hangar's validator; it is not that validator. The one
// Hangar obeys is Rust: src-tauri/src/kits/manifest.rs in simnJS/hangar-ai, and
// docs/kits.md is its contract. A kit's CI cannot build Hangar, so the rules are written
// again here, field by field and in the same words, in the same order. When the two
// disagree, Rust is right and this file has a bug.
//
// test/manifest-fixtures.mjs holds the cases of that file's own Rust tests, translated by hand.
// Running the same cases through the real Rust, to compare the two, is future work.
//
// Where it differs on purpose or by necessity:
// - Stricter: a blank `id` and a blank `version`. Rust skips its format check on an empty
//   string; docs/kits.md says both are required, and a kit with neither is no kit.
// - A regular expression is compiled by JavaScript, not by Rust's `regex`. Look-around and
//   back-references are refused here as Rust refuses them. An inline flag at the start,
//   like (?i), is accepted as Rust accepts it, though Hangar's window cannot read it and
//   refuses every value (docs/kits.md, "A tab with params"). Anything subtler can differ.
// - JSON numbers: Rust tells 1.0 from 1, JSON.parse does not.

import fs from "node:fs";
import path from "node:path";

export const FILE = "hangar-kit.json";
export const SCHEMA = 1;
export const PERMISSIONS = [
  "workspace.read",
  "panes.read",
  "panes.send",
  "files.read",
  "files.write",
  "data.read",
  "data.write",
  "preview.show",
  "notify",
];

const MIN_PORT = 1024;
const COMMAND_MAX_TIMEOUT_SECONDS = 120;
const KIT_DIR = "kitDir";

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
/** serde_json keeps an object's keys sorted: problems come in that order. */
const keysOf = (object) => Object.keys(object).sort();
const field = (at, key) => (at === "" ? key : `${at}.${key}`);

export function loopbackPort(permission) {
  if (!permission.startsWith("loopback:")) return null;
  const digits = permission.slice("loopback:".length);
  if (digits === "" || digits.startsWith("0") || !/^[0-9]+$/.test(digits)) return null;
  const port = Number(digits);
  return port >= MIN_PORT && port <= 65535 ? port : null;
}

const validCommandName = (name) => /^[a-z][a-z0-9-]*$/.test(name);
const validArgName = (name) => /^[A-Za-z_][A-Za-z0-9_-]*$/.test(name);
const validId = (id, min, max) => id.length >= min && id.length <= max && /^[a-z0-9-]*$/.test(id);

/** The placeholders of an argv item: `{name}`; other braces are text. */
export function placeholders(item) {
  const found = [];
  let at = 0;
  for (;;) {
    const open = item.indexOf("{", at);
    if (open < 0) return found;
    const close = item.indexOf("}", open + 1);
    const name = close < 0 ? null : item.slice(open + 1, close);
    if (name !== null && validArgName(name)) {
      found.push(name);
      at = close + 1;
    } else {
      at = open + 1;
    }
  }
}

/** Whether Rust's `regex` would compile this rule, as near as JavaScript can tell. */
export function ruleProblem(pattern) {
  const lookAround = /\(\?(?:=|!|<=|<!)/.test(pattern);
  const backReference = /(?:^|[^\\])(?:\\\\)*\\(?:[1-9]|k<)/.test(pattern);
  // (?i), (?m), (?s), (?x) and (?U) mean something to Rust and nothing to JavaScript.
  const withoutFlags = pattern.replace(/\(\?[imsxU-]+\)/g, "").replace(/\(\?[imsxU-]+:/g, "(?:");
  const compiles = (flags) => {
    try {
      new RegExp(withoutFlags, flags);
      return true;
    } catch {
      return false;
    }
  };
  if (lookAround || backReference || (!compiles("u") && !compiles(""))) return "is not a valid regular expression";
  return null;
}

// semver.org's grammar, which the `semver` crate follows.
const NUMBER = "(?:0|[1-9][0-9]*)";
const PRE = `(?:${NUMBER}|[0-9]*[A-Za-z-][0-9A-Za-z-]*)`;
const VERSION = new RegExp(`^${NUMBER}\\.${NUMBER}\\.${NUMBER}(?:-${PRE}(?:\\.${PRE})*)?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$`);
export const validVersion = (text) => VERSION.test(text);

// A `semver::VersionReq`: comparators joined by commas, each `op? major(.minor(.patch(-pre)?)?)?`,
// or a wildcard in place of a part. Not npm's grammar: no spaces between comparators, no `||`.
const PART = `(?:${NUMBER}|[xX*])`;
const COMPARATOR = `(?:=|>=|>|<=|<|~|\\^)?\\s*${PART}(?:\\.${PART}(?:\\.${PART}(?:-${PRE}(?:\\.${PRE})*)?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?)?)?`;
const REQUIREMENT = new RegExp(`^\\s*${COMPARATOR}(?:\\s*,\\s*${COMPARATOR})*\\s*$`);
export const validRequirement = (text) => REQUIREMENT.test(text);

/** A manifest path as Hangar keeps it, or `{ problem }`. */
export function normalize(raw) {
  if (raw.trim() === "") return { problem: "is empty" };
  if (raw.includes("\0")) return { problem: "holds a NUL character" };
  if (raw.startsWith("/") || raw.startsWith("\\")) return { problem: "must be relative to the kit folder" };
  const parts = [];
  for (const part of raw.split(/[/\\]/)) {
    if (part === "" || part === ".") continue;
    if (part === "..") return { problem: "must not climb out with `..`" };
    if (part.includes(":")) return { problem: "must be relative to the kit folder" };
    parts.push(part);
  }
  return { path: parts.length ? parts.join("/") : "." };
}

function programProblem(program) {
  if (program.trim() === "") return "is empty: the program comes first";
  if (/[{}]/.test(program)) return "must not hold a placeholder: the program is fixed";
  if (/[/\\:]/.test(program) || program.endsWith(".") || program.endsWith(" ")) return "must be a program's name, found on the PATH, not a path";
  return null;
}

class Check {
  constructor(root) {
    this.root = root;
    this.problems = [];
    this.declaredCommands = new Set();
  }

  problem(at, what) {
    this.problems.push(`${at}: ${what}`);
  }

  required(object, key, at) {
    const value = object[key];
    if (typeof value === "string") return value;
    this.problem(field(at, key), value === undefined || value === null ? "is missing" : "must be a string");
    return undefined;
  }

  requiredText(object, key, at) {
    const text = this.required(object, key, at);
    if (text === undefined) return undefined;
    if (text.trim() === "") {
      this.problem(field(at, key), "is empty");
      return undefined;
    }
    return text;
  }

  optional(object, key, at) {
    const value = object[key];
    if (value === undefined || value === null) return undefined;
    if (typeof value === "string") return value;
    this.problem(field(at, key), "must be a string");
    return undefined;
  }

  /** Where a normalized path lands once links are followed, or `{ problem }`. */
  inside(relative) {
    const joined = relative === "." ? this.root : path.join(this.root, relative);
    let real;
    try {
      real = fs.realpathSync(joined);
    } catch {
      return { problem: "not found in the kit folder" };
    }
    const prefix = this.root.endsWith(path.sep) ? this.root : this.root + path.sep;
    if (real === this.root || real.startsWith(prefix)) return { real };
    return { problem: "leads outside the kit folder" };
  }

  file(raw, at, extensions) {
    const { path: relative, problem } = normalize(raw);
    if (problem) return this.problem(at, problem);
    const lower = relative.toLowerCase();
    if (!extensions.some((extension) => lower.endsWith(extension))) return this.problem(at, `must be a ${extensions.join(" or ")} file`);
    const found = this.inside(relative);
    if (found.problem) return this.problem(at, found.problem);
    if (!fs.statSync(found.real).isFile()) return this.problem(at, "is not a file");
    return relative;
  }

  manifest(object) {
    const schema = object.schema;
    if (schema === undefined) this.problem("schema", "is missing");
    else if (schema === SCHEMA) {
      // what this reads
    } else if (Number.isInteger(schema) && schema > SCHEMA) this.problem("schema", `${schema} needs a newer Hangar (this one reads ${SCHEMA})`);
    else this.problem("schema", `must be ${SCHEMA}`);

    const id = this.required(object, "id", "");
    if (id !== undefined && !validId(id, 2, 40)) this.problem("id", "must be 2 to 40 characters among a-z, 0-9 and -");
    this.requiredText(object, "name", "");
    const version = this.required(object, "version", "");
    if (version !== undefined && !validVersion(version)) this.problem("version", `${JSON.stringify(version)} is not a semver version (like 1.2.0)`);
    this.required(object, "description", "");
    this.optional(object, "author", "");
    const homepage = this.optional(object, "homepage", "");
    if (homepage !== undefined && !/^https?:\/\//i.test(homepage)) this.problem("homepage", "must be an http(s) link");
    const icon = this.optional(object, "icon", "");
    if (icon !== undefined) this.file(icon, "icon", [".svg", ".png"]);
    const hangar = this.optional(object, "hangar", "");
    if (hangar !== undefined && !validRequirement(hangar)) this.problem("hangar", `${JSON.stringify(hangar)} is not a version requirement (like >=1.6.0)`);
    this.plugin(object);
    // Before the tabs, whose permissions may name these.
    this.commands(object);
    this.tabs(object);
    this.setup(object);
  }

  plugin(object) {
    let raw = this.optional(object, "plugin", "");
    if (raw === undefined) {
      const absent = object.plugin === undefined || object.plugin === null;
      if (!absent || !isDirectory(path.join(this.root, ".claude-plugin"))) return;
      raw = ".";
    }
    const { path: relative, problem } = normalize(raw);
    if (problem) return this.problem("plugin", problem);
    const found = this.inside(relative);
    if (found.problem) return this.problem("plugin", found.problem);
    if (!isFile(path.join(found.real, ".claude-plugin", "plugin.json"))) this.problem("plugin", "holds no .claude-plugin/plugin.json");
  }

  list(object, key) {
    const value = object[key];
    if (value === undefined || value === null) return [];
    if (Array.isArray(value)) return value;
    this.problem(key, "must be a list");
    return [];
  }

  item(value, at, seen) {
    if (!isObject(value)) {
      this.problem(at, "must be an object");
      return false;
    }
    const id = this.required(value, "id", at);
    if (id === undefined) return false;
    if (!validId(id, 1, 40)) this.problem(field(at, "id"), "must be 1 to 40 characters among a-z, 0-9 and -");
    else if (seen.has(id)) this.problem(field(at, "id"), `${JSON.stringify(id)} is used twice`);
    else seen.add(id);
    return true;
  }

  tabs(object) {
    const seen = new Set();
    this.list(object, "tabs").forEach((tab, index) => {
      const at = `tabs[${index}]`;
      if (!this.item(tab, at, seen)) return;
      this.requiredText(tab, "title", at);
      const entry = this.required(tab, "entry", at);
      if (entry !== undefined) this.file(entry, field(at, "entry"), [".html"]);
      const icon = this.optional(tab, "icon", at);
      if (icon !== undefined) this.file(icon, field(at, "icon"), [".svg", ".png"]);
      this.permissions(tab, at);
      this.tabParams(tab, at);
      if (tab.singleton !== undefined && tab.singleton !== null && typeof tab.singleton !== "boolean") {
        this.problem(field(at, "singleton"), "must be true or false");
      }
    });
  }

  tabParams(tab, tabAt) {
    const at = field(tabAt, "params");
    const declared = tab.params;
    if (declared === undefined || declared === null) return;
    if (!isObject(declared)) return this.problem(at, "must be an object of params by name");
    for (const name of keysOf(declared)) {
      const paramAt = field(at, name);
      if (!validArgName(name)) this.problem(paramAt, "must be named with a letter or _ first, then letters, digits, _ and -");
      const param = declared[name];
      if (!isObject(param)) {
        this.problem(paramAt, "must be an object with a description");
        continue;
      }
      if (this.requiredText(param, "description", paramAt) === undefined) continue;
      const pattern = this.optional(param, "pattern", paramAt);
      if (pattern !== undefined) {
        const invalid = pattern.trim() === "" ? "is empty" : ruleProblem(pattern);
        if (invalid) this.problem(field(paramAt, "pattern"), invalid);
      }
    }
  }

  permissions(tab, tabAt) {
    const at = field(tabAt, "permissions");
    if (!("permissions" in tab)) return this.problem(at, "is missing (an empty list asks for nothing)");
    const items = tab.permissions;
    if (!Array.isArray(items)) return this.problem(at, "must be a list");
    for (const name of items) {
      if (typeof name !== "string") this.problem(at, "must list strings");
      else if (PERMISSIONS.includes(name) || loopbackPort(name) !== null) continue;
      else if (name.startsWith("loopback:")) this.problem(at, `${JSON.stringify(name)} must name a port from 1024 to 65535`);
      else if (name.startsWith("command:")) {
        if (!this.declaredCommands.has(name.slice("command:".length))) this.problem(at, `${JSON.stringify(name)} names a command this kit does not declare`);
      } else this.problem(at, `unknown permission ${JSON.stringify(name)}`);
    }
  }

  setup(object) {
    const seen = new Set();
    this.list(object, "setup").forEach((step, index) => {
      const at = `setup[${index}]`;
      if (!this.item(step, at, seen)) return;
      this.requiredText(step, "title", at);
      this.optional(step, "description", at);
      this.run(step, at);
    });
  }

  run(step, stepAt) {
    const at = field(stepAt, "run");
    if (!isObject(step.run)) return this.problem(at, step.run === undefined ? "is missing" : "must be an object of commands by OS");
    let some = false;
    for (const os of ["windows", "macos", "linux"]) {
      const text = this.optional(step.run, os, at);
      if (text === undefined) continue;
      if (text.trim() === "") this.problem(field(at, os), "is empty");
      else some = true;
    }
    if (!some) this.problem(at, "needs a command for windows, macos or linux");
  }

  commands(object) {
    const declared = object.commands;
    if (declared === undefined || declared === null) return;
    if (!isObject(declared)) return this.problem("commands", "must be an object of commands by name");
    this.declaredCommands = new Set(Object.keys(declared));
    for (const name of keysOf(declared)) {
      const at = `commands.${name}`;
      if (!validCommandName(name)) this.problem(at, "must be named with a-z first, then a-z, 0-9 and -");
      const command = declared[name];
      if (!isObject(command)) {
        this.problem(at, "must be an object");
        continue;
      }
      this.requiredText(command, "description", at);
      const args = this.commandArgs(command, at);
      this.commandRun(command, at, args);
      this.commandTimeout(command, at);
    }
  }

  /** The names `args` declares, `null` when one is wrong: `run` is then not looked up. */
  commandArgs(command, commandAt) {
    const at = field(commandAt, "args");
    const declared = command.args;
    if (declared === undefined || declared === null) return new Set();
    if (!isObject(declared)) {
      this.problem(at, "must be an object of args by name");
      return null;
    }
    const names = new Set();
    let ok = true;
    for (const name of keysOf(declared)) {
      const argAt = field(at, name);
      if (!validArgName(name)) {
        this.problem(argAt, "must be named with a letter or _ first, then letters, digits, _ and -");
        ok = false;
      }
      if (name === KIT_DIR) {
        this.problem(argAt, "is reserved: Hangar fills {kitDir} in with the kit's folder");
        ok = false;
        continue;
      }
      const arg = declared[name];
      if (!isObject(arg)) {
        this.problem(argAt, "must be an object with a pattern");
        ok = false;
        continue;
      }
      const pattern = this.requiredText(arg, "pattern", argAt);
      if (pattern === undefined) {
        ok = false;
        continue;
      }
      const invalid = ruleProblem(pattern);
      if (invalid) {
        this.problem(field(argAt, "pattern"), invalid);
        ok = false;
        continue;
      }
      this.optional(arg, "description", argAt);
      names.add(name);
    }
    return ok ? names : null;
  }

  commandRun(command, commandAt, args) {
    const at = field(commandAt, "run");
    const run = command.run;
    if (Array.isArray(run)) return this.argv(run, at, args);
    if (isObject(run)) {
      let some = false;
      let ok = true;
      for (const os of ["windows", "macos", "linux"]) {
        const value = run[os];
        if (value === undefined || value === null) continue;
        ok = this.argv(value, field(at, os), args) && ok;
        some = true;
      }
      if (ok && !some) this.problem(at, "needs an argv for windows, macos or linux");
      return;
    }
    if (run === undefined || run === null) return this.problem(at, "is missing");
    this.problem(at, "must be an argv array, or one per OS: never a shell command line");
  }

  argv(value, at, args) {
    if (!Array.isArray(value)) {
      this.problem(at, "must be an argv array");
      return false;
    }
    let ok = true;
    value.forEach((item, index) => {
      const itemAt = `${at}[${index}]`;
      if (typeof item !== "string") {
        this.problem(itemAt, "must be a string");
        ok = false;
        return;
      }
      if (item.includes("\0")) {
        this.problem(itemAt, "holds a NUL character");
        ok = false;
        return;
      }
      if (index === 0) {
        const why = programProblem(item);
        if (why) {
          this.problem(itemAt, why);
          ok = false;
        }
        return;
      }
      if (args === null) return;
      for (const name of placeholders(item)) {
        if (name !== KIT_DIR && !args.has(name)) {
          this.problem(itemAt, `the placeholder {${name}} is not declared in args`);
          ok = false;
        }
      }
    });
    if (value.length === 0) {
      this.problem(at, "needs at least the program");
      ok = false;
    }
    return ok;
  }

  commandTimeout(command, at) {
    const value = command.timeoutSeconds;
    if (value === undefined || value === null) return;
    if (!Number.isInteger(value) || value < 1 || value > COMMAND_MAX_TIMEOUT_SECONDS) {
      this.problem(field(at, "timeoutSeconds"), `must be a whole number of seconds from 1 to ${COMMAND_MAX_TIMEOUT_SECONDS}`);
    }
  }
}

function isDirectory(file) {
  try {
    return fs.statSync(file).isDirectory();
  } catch {
    return false;
  }
}

function isFile(file) {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

/** Checks a manifest's text against the kit folder it sits in. Every problem is listed. */
export function parseManifest(text, root) {
  let value;
  try {
    value = JSON.parse(text.replace(/^﻿/, ""));
  } catch (error) {
    return { problems: [`${FILE} is not valid JSON: ${error.message}`] };
  }
  if (!isObject(value)) return { problems: [`${FILE} must hold a JSON object`] };
  const check = new Check(fs.realpathSync(root));
  check.manifest(value);
  return { problems: check.problems, manifest: value };
}

/** Reads and checks `<root>/hangar-kit.json`. */
export function readManifest(root) {
  const file = path.join(root, FILE);
  if (!fs.existsSync(file)) return { problems: [`no ${FILE} in the kit folder`] };
  return parseManifest(fs.readFileSync(file, "utf8"), root);
}
