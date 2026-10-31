// Edits a kit needs that no general rule covers. Each must still apply, or the split stops.
//
// The names in English are those of the manifests, which the catalog and Hangar's settings show, and
// of the tab. A page's own strings stay translated, so a page in French still calls itself as before.
const swap = (file, from, to) => ({ file, from, to });
const manifestNames = (from, to) => [swap("hangar-kit.json", `"name": "${from}",`, `"name": "${to}",`), swap("hangar-kit.json", `"title": "${from}",`, `"title": "${to}",`), swap("test/manifest.test.js", `assert.equal(manifest.name, "${from}");`, `assert.equal(manifest.name, "${to}");`), swap("test/manifest.test.js", `assert.equal(tab.title, "${from}");`, `assert.equal(tab.title, "${to}");`), swap("README.md", `# ${from}`, `# ${to}`)];

export default {
  annotate: [...manifestNames("Annoter", "Annotate"), swap("skills/annotate/SKILL.md", "Hangar's Annoter tab", "Hangar's Annotate tab")],
  checklist: [
    ...manifestNames("Recette", "Checklist"),
    swap("README.md", "**The Recette tab.**", "**The Checklist tab.**"),
    swap("skills/checklist/SKILL.md", "Hangar's Recette tab", "Hangar's Checklist tab"),
    swap("tabs/checklist/index.html", "<title>Recette</title>", "<title>Checklist</title>"),
    swap("tabs/checklist/logic.js", 'tab: "Recette",\n      loading: "Reading the list…",', 'tab: "Checklist",\n      loading: "Reading the list…",'),
  ],
  db: [
    swap("hangar-kit.json", '"title": "Base de données",', '"title": "Database",'),
    swap("test/manifest.test.js", 'assert.equal(tab.title, "Base de données");', 'assert.equal(tab.title, "Database");'),
    // Past 300 characters, Hangar's gallery shows the card without this sentence.
    swap(
      "hangar-kit.json",
      "Runs four declared commands, a Node script that opens a SQLite file of the workspace read-only (never any SQL of your own) to list databases, tables, a structure and a page of rows; keeps your last choice in the kit's own data folder; and sends a table and your question, never its rows, to an agent of the workspace only when you click.",
      "Runs four declared commands, a Node script that opens a SQLite file of the workspace read-only (no SQL of your own) to list databases, tables, a structure and rows; keeps your last choice in the kit's data folder; sends a table and your question, never its rows, to an agent only when you click.",
    ),
  ],
  editor: [
    ...manifestNames("Éditeur", "Editor"),
    swap("skills/editor/SKILL.md", "Hangar's Éditeur tab", "Hangar's Editor tab"),
    swap("tabs/editor/index.html", "<title>Éditeur</title>", "<title>Editor</title>"),
    swap("tabs/editor/logic.js", 'tab: "Éditeur",\n      loading: "Loading…",', 'tab: "Editor",\n      loading: "Loading…",'),
    swap("test/validate.test.js", 'const root = path.join(__dirname, "..", "..", "..");', 'const root = path.join(__dirname, "..");'),
    swap(
      "test/validate.test.js",
      'const samples = [".github/workflows/ci.yml", ".github/workflows/release.yml", ".github/ISSUE_TEMPLATE/bug_report.yml", "pnpm-lock.yaml", "src-tauri/Cargo.toml", "sws.toml", "package.json", "tsconfig.json"];',
      'const samples = [".github/workflows/ci.yml", ".github/repo.json", "hangar-kit.json", "package.json"];',
    ),
    // A class that never closes: git's wildmatch matches nothing. The kit read it as a literal `[`, which
    // only Linux can show, as Windows cannot name a file that way.
    swap("tabs/editor/gitignore.js", '        } else {\n          out += "\\\\[";\n        }', "        } else {\n          return null; // never closes: git's wildmatch matches nothing\n        }"),
    swap("test/gitignore.test.js", '["[\\n", "[", true],', '["[\\n", "[", false],'),
  ],
  guard: [
    swap("hangar-kit.json", '"title": "Garde-fous",', '"title": "Guardrails",'),
    swap("test/manifest.test.js", 'test("the tab: « Garde-fous », and the two permissions it needs"', 'test("the tab: Guardrails, and the two permissions it needs"'),
    swap("test/manifest.test.js", 'assert.equal(tab.title, "Garde-fous");', 'assert.equal(tab.title, "Guardrails");'),
    swap("README.md", "# Guardrails (Garde-fous)", "# Guardrails"),
    swap("README.md", "**The tab « Garde-fous »**", "**The Guardrails tab**"),
  ],
  services: [swap("test/manifest.test.js", '  const index = JSON.parse(fs.readFileSync(path.join(KIT, "..", "index.json"), "utf8"));\n  assert.ok(!index.kits.some((kit) => kit.id === "services"), "a kit never edits kits/index.json");\n', "")],
  // Past 300 characters, Hangar's gallery shows the card without this sentence.
  todo: [
    swap(
      "hangar-kit.json",
      "Runs one declared command, a Node script that only reads the files of the workspace that .gitignore leaves in (and runs `git blame` on one file when you ask for its author); opens a file in the preview when you click; keeps the last scan in the kit's own data folder; and sends a comment to an agent of the workspace only when you click.",
      "Runs one declared command, a Node script that only reads the workspace's files .gitignore leaves in (and `git blame` on one file when you ask); opens a file in the preview when you click; keeps the last scan in the kit's data folder; sends a comment to an agent only when you click.",
    ),
  ],
  // A Windows path read on Linux, where path.basename does not split on a backslash. Only the test can
  // meet one there, but CI runs on both.
  tests: [swap("hooks/capture.js", "const project = path.basename(String(projectDir)", "const project = path.win32.basename(String(projectDir)")],
};
