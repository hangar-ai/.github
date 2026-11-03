// Kit folders for the tests: made in the temporary folder, removed by the test that made them.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** A kit folder: a file is its text, its bytes, or `{ size }` for a file of that many bytes of nothing. */
export function kitFolder(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kit-check-"));
  for (const [relative, body] of Object.entries(files)) {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (typeof body === "object" && !Buffer.isBuffer(body)) {
      fs.writeFileSync(file, "");
      fs.truncateSync(file, body.size);
    } else fs.writeFileSync(file, body);
  }
  return root;
}
