// The scans must fire: one that never finds anything looks the same as one that passes.
import test from "node:test";
import assert from "node:assert/strict";
import { kindsIn } from "../scripts/lib/personal.mjs";
import { colourIn } from "../scripts/lib/pages.mjs";

test("personal data is found, and made-up people are left alone", () => {
  const home = ["/ho", "me/jane/x"].join("");
  const windows = ["C:", "Users", "jane", "x"].join("\\");
  assert.deepEqual(kindsIn(`cat ${home}`), ["user folder"]);
  assert.deepEqual(kindsIn(windows), ["user folder"]);
  assert.deepEqual(kindsIn(["jane", "gmail.com"].join("@")), ["email"]);
  assert.deepEqual(kindsIn(["DESKTOP", "A1B2C3D"].join("-")), ["machine name"]);
  assert.deepEqual(kindsIn(["ghp", "a".repeat(36)].join("_")), ["key"]);
  assert.deepEqual(kindsIn("-----BEGIN RSA PRIVATE KEY-----"), ["key"]);
  assert.deepEqual(kindsIn("the one I named", ["named"]), ["named on the command line"]);
  for (const fine of ["/home/dev/project", "C:\\Users\\dev\\x", "C:\\\\Users\\\\dev\\\\x", "git@github.com:a/b", "a@example.com", "a@users.noreply.github.com", ".env.local", "128x128@2x.png"]) {
    assert.deepEqual(kindsIn(fine), [], fine);
  }
});

test("a colour of its own is found, and tokens are left alone", () => {
  for (const css of ["a{color:#fff}", "a{background:rgb(0,0,0)}", "a{border:1px solid red}", "a{fill:Canvas}", "@media (prefers-color-scheme:dark){a{top:0}}"]) {
    assert.ok(colourIn(css), css);
  }
  for (const css of ["a{color:var(--kit-text)}", "a{background:color-mix(in srgb,var(--kit-ok-fill) 10%,var(--kit-well))}", "/* #fff */a{top:0}", "a{transition:color .2s}", "a{border-color:transparent}"]) {
    assert.equal(colourIn(css), null, css);
  }
});
