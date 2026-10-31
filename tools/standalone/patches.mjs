// Edits a kit needs that no general rule covers. Each must still apply, or the split stops.
export default {
  editor: [
    {
      file: "test/validate.test.js",
      from: 'const root = path.join(__dirname, "..", "..", "..");',
      to: 'const root = path.join(__dirname, "..");',
    },
    {
      file: "test/validate.test.js",
      from: 'const samples = [".github/workflows/ci.yml", ".github/workflows/release.yml", ".github/ISSUE_TEMPLATE/bug_report.yml", "pnpm-lock.yaml", "src-tauri/Cargo.toml", "sws.toml", "package.json", "tsconfig.json"];',
      to: 'const samples = [".github/workflows/ci.yml", ".github/repo.json", "hangar-kit.json", "package.json"];',
    },
    // A class that never closes: git's wildmatch matches nothing. The kit read it as a literal `[`, which
    // only Linux can show, as Windows cannot name a file that way. Also to fix in Hangar's kits/editor.
    {
      file: "tabs/editor/gitignore.js",
      from: '        } else {\n          out += "\\\\[";\n        }',
      to: "        } else {\n          return null; // never closes: git's wildmatch matches nothing\n        }",
    },
    {
      file: "test/gitignore.test.js",
      from: '["[\\n", "[", true],',
      to: '["[\\n", "[", false],',
    },
  ],
  // Past 300 characters, Hangar's gallery shows the card without this sentence. Also to fix in kits/todo.
  todo: [
    {
      file: "hangar-kit.json",
      from: "Runs one declared command, a Node script that only reads the files of the workspace that .gitignore leaves in (and runs `git blame` on one file when you ask for its author); opens a file in the preview when you click; keeps the last scan in the kit's own data folder; and sends a comment to an agent of the workspace only when you click.",
      to: "Runs one declared command, a Node script that only reads the workspace's files .gitignore leaves in (and `git blame` on one file when you ask); opens a file in the preview when you click; keeps the last scan in the kit's data folder; sends a comment to an agent only when you click.",
    },
  ],
  // A Windows path read on Linux, where path.basename does not split on a backslash. Only the test can
  // meet one there, but CI runs on both. Also to fix in Hangar's kits/tests.
  tests: [
    {
      file: "hooks/capture.js",
      from: "const project = path.basename(String(projectDir)",
      to: "const project = path.win32.basename(String(projectDir)",
    },
  ],
  services: [
    {
      file: "test/manifest.test.js",
      from: '  const index = JSON.parse(fs.readFileSync(path.join(KIT, "..", "index.json"), "utf8"));\n  assert.ok(!index.kits.some((kit) => kit.id === "services"), "a kit never edits kits/index.json");\n',
      to: "",
    },
  ],
};
