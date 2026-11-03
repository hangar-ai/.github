// Which files the personal-data scan reads: those a kit would publish, not the build output beside them.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { filesOf, scanFiles } from "../scripts/lib/personal.mjs";
import { kitFolder } from "./kit-folder.mjs";

const hasGit = spawnSync("git", ["--version"]).status === 0;
const git = (root, ...args) => {
  const { status, stderr } = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
  assert.equal(status, 0, stderr);
};
/** A folder with a made-up user's folder in it: no one's, and not written down whole here. */
const home = ["/ho", "me/jane/x"].join("");

function withFolder(files, body) {
  const root = kitFolder(files);
  try {
    return body(fs.realpathSync(root));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test("a folder that is no repository is read whole, but for the folders nobody publishes", () => {
  withFolder({ "a.txt": "", "native/target/x.d": "", "node_modules/y/z.js": "", ".hangar-ui/kit.css": "", ".git/config": "" }, (root) => {
    assert.deepEqual(filesOf(root).sort(), ["a.txt", "native/target/x.d"]);
  });
});

test("a repository's own folder is read as it would be published: tracked, or not ignored", { skip: !hasGit && "no git here" }, () => {
  withFolder({ ".gitignore": "native/target/\n", "keep.txt": "", "gone.txt": "", "sub/new.txt": "", "native/src/lib.rs": "", "native/target/debug/x.d": "", "node_modules/y/z.js": "" }, (root) => {
    git(root, "init", "-q");
    git(root, "add", "keep.txt", "gone.txt");
    fs.rmSync(path.join(root, "gone.txt"));
    assert.deepEqual(filesOf(root), [".gitignore", "keep.txt", "native/src/lib.rs", "sub/new.txt"]);
  });
});

test("a folder inside a repository is read whole, even where the repository ignores it", { skip: !hasGit && "no git here" }, () => {
  withFolder({ ".gitignore": "kit/\n", "kit/a.txt": "", "kit/b/c.txt": "" }, (outer) => {
    git(outer, "init", "-q");
    assert.deepEqual(filesOf(path.join(outer, "kit")).sort(), ["a.txt", "b/c.txt"]);
  });
});

test("what the repository ignores is not scanned, and what it publishes is", { skip: !hasGit && "no git here" }, () => {
  withFolder({ ".gitignore": "native/target/\n", "native/target/x.d": `${home}\n`, "notes.txt": `${home}\n` }, (root) => {
    git(root, "init", "-q");
    assert.deepEqual(scanFiles(root), [{ place: "notes.txt:1", kind: "user folder" }]);
  });
  // Without git to say, the build output is read like any file.
  withFolder({ ".gitignore": "native/target/\n", "native/target/x.d": `${home}\n`, "notes.txt": `${home}\n` }, (root) => {
    assert.deepEqual(scanFiles(root).map(({ place }) => place).sort(), ["native/target/x.d:1", "notes.txt:1"]);
  });
});
