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
  ],
  services: [
    {
      file: "test/manifest.test.js",
      from: '  const index = JSON.parse(fs.readFileSync(path.join(KIT, "..", "index.json"), "utf8"));\n  assert.ok(!index.kits.some((kit) => kit.id === "services"), "a kit never edits kits/index.json");\n',
      to: "",
    },
  ],
};
