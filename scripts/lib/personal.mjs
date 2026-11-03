// What must not be in a public kit: paths under a person's folder, email addresses, machine
// names and keys. Looked for in the files, in the commit messages, in every path the history
// ever held, and in every line it ever added: a repository keeps what a later commit took out.
//
// Findings name a place and a kind, never the text: a CI log is public too.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/** Names a test or a doc uses for a made-up person: not anyone's folder. */
const PLACEHOLDER_USERS = /^(?:dev|me|you|user|username|name|runner|someone|somebody|example|test|tester|ci|foo|bar|alice|bob|x|a|u|<[^>]*>|\$[A-Za-z_{}]+|%[A-Za-z_]+%|\.\.\.|…)$/i;

/** Addresses that reach nobody: reserved domains, GitHub's no-reply, git's own SSH user. */
const PLACEHOLDER_MAIL = /(?:@example\.(?:com|org|net)|\.invalid|\.test|\.example|\.localhost|@(?:users\.)?noreply\.github\.com|^git@github\.com|@\d+(?:\.\d+)?x\.(?:png|webp|jpe?g|gif|avif|bmp|svg))$/i;

const KEYS = [
  /\bgh[pousr]_[A-Za-z0-9]{36,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{22,}\b/,
  /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}\b/,
  /\b[rs]k_live_[0-9a-zA-Z]{20,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/,
  /\bAIza[0-9A-Za-z_-]{35}\b/,
  /\bnpm_[A-Za-z0-9]{36}\b/,
  /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];

const MACHINES = [
  /\b(?:DESKTOP|LAPTOP)-[A-Z0-9]{5,}\b/,
  /\bWIN-[A-Z0-9]{8,}\b/,
  /\b[\w-]*(?:MacBook|iMac|Mac-?[Mm]ini|Mac-?Studio)[\w-]*\.local\b/,
  /\b(?:COMPUTERNAME|HOSTNAME)\s*=\s*[A-Za-z0-9][\w-]{2,}/,
];

const USER_PATHS = [
  /\b[A-Za-z]:(?:\\\\?|\/)Users(?:\\\\?|\/)([^\\/\s"'`<>:;,)]+)/g,
  /(?:^|[\s"'`(=:])\/[a-z]\/Users\/([^/\s"'`<>:;,)]+)/g,
  /(?:^|[\s"'`(=:])\/Users\/([^/\s"'`<>:;,)]+)/g,
  /(?:^|[\s"'`(=:])\/home\/([^/\s"'`<>:;,)]+)/g,
];

const MAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;

/**
 * The kinds of what one line holds. `extra` is a list of strings this person knows are theirs
 * (their name, their machine's), given on the command line and never written down here.
 */
export function kindsIn(line, extra = []) {
  const found = new Set();
  for (const rule of USER_PATHS) {
    for (const match of line.matchAll(rule)) {
      if (!PLACEHOLDER_USERS.test(match[1])) found.add("user folder");
    }
  }
  for (const [address] of line.matchAll(MAIL)) {
    if (!PLACEHOLDER_MAIL.test(address)) found.add("email");
  }
  if (MACHINES.some((rule) => rule.test(line))) found.add("machine name");
  if (KEYS.some((rule) => rule.test(line))) found.add("key");
  const lower = line.toLowerCase();
  if (extra.some((text) => lower.includes(text.toLowerCase()))) found.add("named on the command line");
  return [...found];
}

const SKIPPED_FOLDERS = new Set([".git", "node_modules", ".hangar-ui"]);

export function walk(root, relative = "") {
  const found = [];
  for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
    if (SKIPPED_FOLDERS.has(entry.name)) continue;
    const child = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) found.push(...walk(root, child));
    else if (entry.isFile()) found.push(child);
  }
  return found;
}

/**
 * The files a kit would publish, when the folder is a git repository's own: those git tracks, and
 * those it does not track and does not ignore. What it ignores (a Rust tab's `native/target/`, whose
 * build output names the folders of the machine that built it) is never committed, and in a
 * checkout, as CI has, there is none of it. `null` when the folder is not the top of a repository,
 * or git is not here: a folder inside a repository that ignores it would otherwise be read as empty.
 */
function publishable(root) {
  try {
    if (git(root, "rev-parse", "--show-cdup").trim() !== "") return null;
    const listed = git(root, "ls-files", "-z", "--cached", "--others", "--exclude-standard").split("\0").filter(Boolean);
    // A file git tracks may be gone from the folder, and a gitlink is a folder.
    return listed.filter((file) => {
      try {
        return fs.lstatSync(path.join(root, file)).isFile();
      } catch {
        return false;
      }
    });
  } catch {
    return null;
  }
}

/** What to look through: the publishable files, or all of the folder's where git cannot say. */
export function filesOf(root) {
  const listed = publishable(root);
  if (listed === null) return walk(root);
  return [...new Set(listed)].filter((file) => !file.split("/").some((part) => SKIPPED_FOLDERS.has(part))).sort();
}

const isBinary = (buffer) => buffer.subarray(0, 8192).includes(0);

/** `allow` is `[{ path, kinds?, why }]`, from the kit's .kit-check.json: fake keys a test needs. */
function excused(allow, file, kind) {
  return allow.some((rule) => rule.path === file && (!rule.kinds || rule.kinds.includes(kind)));
}

export function scanFiles(root, { allow = [], extra = [] } = {}) {
  const findings = [];
  for (const file of filesOf(root)) {
    const buffer = fs.readFileSync(path.join(root, file));
    if (isBinary(buffer)) continue;
    buffer
      .toString("utf8")
      .split(/\r?\n/)
      .forEach((line, index) => {
        for (const kind of kindsIn(line, extra)) {
          if (!excused(allow, file, kind)) findings.push({ place: `${file}:${index + 1}`, kind });
        }
      });
    for (const kind of kindsIn(file, extra)) findings.push({ place: `path ${file}`, kind });
  }
  return findings;
}

function git(root, ...args) {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8", maxBuffer: 512 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
}

/** What the history holds. `null` when this is no git repository, or a shallow clone. */
export function scanHistory(root, { allow = [], extra = [] } = {}) {
  let shallow;
  try {
    shallow = git(root, "rev-parse", "--is-shallow-repository").trim() === "true";
  } catch {
    return null;
  }
  if (shallow) return null;
  const findings = [];
  const commits = git(root, "log", "--all", "--format=%H%x00%B%x01");
  for (const record of commits.split("\x01")) {
    const [hash, message] = record.trim().split("\0");
    if (!hash) continue;
    for (const kind of kindsIn(message ?? "", extra)) findings.push({ place: `message of ${hash.slice(0, 10)}`, kind });
  }
  for (const file of new Set(git(root, "log", "--all", "--name-only", "--format=").split("\n"))) {
    for (const kind of kindsIn(file, extra)) findings.push({ place: `path in history ${file}`, kind });
  }
  let file = "";
  for (const line of git(root, "log", "--all", "-p", "--format=", "--no-color", "--no-renames", "--no-ext-diff", "-U0").split("\n")) {
    if (line.startsWith("+++ ")) {
      file = line.slice(4).replace(/^b\//, "");
      continue;
    }
    if (!line.startsWith("+")) continue;
    for (const kind of kindsIn(line.slice(1), extra)) {
      if (!excused(allow, file, kind)) findings.push({ place: `added in history ${file}`, kind });
    }
  }
  const seen = new Set();
  return findings.filter(({ place, kind }) => {
    const key = `${place} ${kind}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** The addresses commits carry. A known point: listed, never refused. */
export function authorEmails(root) {
  try {
    const lines = git(root, "log", "--all", "--format=%an <%ae>%n%cn <%ce>").split("\n").filter(Boolean);
    const counts = new Map();
    for (const line of lines) counts.set(line, (counts.get(line) ?? 0) + 1);
    return [...counts.keys()].sort();
  } catch {
    return [];
  }
}
