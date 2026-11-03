# hangar-ai/.github

What the [hangar-ai](https://github.com/hangar-ai) organization shares between its repositories.

| Path                                  | What                                                                  |
| ------------------------------------- | --------------------------------------------------------------------- |
| `profile/README.md`                   | The organization's public page.                                       |
| `.github/workflows/kit-check.yml`     | The reusable workflow every kit repository calls.                     |
| `scripts/kit-check.mjs`               | What it runs: manifest, card, pages, native modules, personal data. Node alone. |
| `brand/`                              | The avatar, banner and social preview, with their sources and `render.mjs`. |
| `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md` | The defaults of every repository here.           |

## Kit check

```sh
node scripts/kit-check.mjs <kit folder>
```

The manifest check **restates the rules of Hangar's Rust validator**
(`src-tauri/src/kits/manifest.rs`, and `crates/hangar-core/src/kits/manifest.rs` of the native Hangar
for schema 2): it is not that validator, and Hangar reads every manifest again itself.
`scripts/lib/manifest.mjs` says where the two can differ. `node --test` here runs its cases,
translated by hand from those files' Rust tests.

From a kit, with this repository cloned beside it, on the branch you want to check with:

```sh
git clone --branch rust-rewrite https://github.com/hangar-ai/.github .github-org   # once, beside the kit
node ../.github-org/scripts/kit-check.mjs .                                        # from the kit's folder
```

Where the kit is a git repository, the personal-data scan reads the files git tracks or does not
ignore, so a Rust tab's `native/target/` is not looked through; in a checkout, which is what CI has,
that is every file.

### Schema 2: native tabs

The manifest may say `"schema": 1` or `"schema": 2`, as the native Hangar reads it
(`docs/native/kits-native.md` there). Schema 2 changes nothing else: a schema-1 kit is judged as it was.

- A tab is **native** when its `entry` ends in `.wasm`, which needs `"schema": 2`:
  `tabs[0].entry: a native tab needs "schema": 2` otherwise. A schema above 2 `needs a newer Hangar`.
- A schema-1 tab may keep an HTML `entry` and add `native`, a `.wasm` beside it, so that Hangar 1.x
  opens the page and the native Hangar the module. `native` is accepted in schema 2 too. A tab whose
  `entry` is a `.wasm` and that has a `native` is an error.
- A `.wasm` follows the rules of an HTML `entry`: inside the kit, no `..`, no absolute path, no link
  that leads out, an existing file. A module larger than 64 MB is refused.
- A native tab has no page: nothing is linted for it, and the folder its module sits in is not read for
  pages. A page beside a `native` module is checked as it always was.
- A module is looked into: it starts like a WebAssembly module (`\0asm`, binary version 1), and its
  import section names only `hangar.log` and `hangar.now`, as functions. A module built for WASI or
  with wasm-bindgen is refused with the reason the native Hangar gives.

The wording is the Rust validator's, so that a problem reads the same here as in Hangar. What this
does not look at, and Hangar does when it opens the tab: the types of the two imports, the exports
(`memory`, `hangar_abi_version`, `hangar_alloc`, `hangar_init`, `hangar_update`, `hangar_view`), the ABI
number, and the features its engine turns off. A kit's own tests can ask an engine for those, with
`new WebAssembly.Module`, as kit-template's do.

### A kit on its `rust-rewrite` branch

Until a tag carries schema 2, a kit calls the workflow at this repository's `rust-rewrite` branch:

```yaml
jobs:
  kit-check:
    uses: hangar-ai/.github/.github/workflows/kit-check.yml@rust-rewrite
```

The scripts are read from the ref `tools-ref` names, which has to be the ref of `uses`: on the
`rust-rewrite` branch its default is the branch, so that this line is all a kit changes. The commit
that tags this sets that default to the tag. Kits on `main` keep calling `@v1`, which does not read
schema 2.

## Future work

- Run those cases through the real Rust as well, to compare the two line by line. Nothing has done that.
- Check a module's exports, and the types of its two imports, as Hangar's runtime does.
- Check that every class a page names exists in Hangar UI from kit-check, rather than in each kit's tests.

The profile, the logo's colours and the type come from Hangar's site and `Logo.tsx`: see `brand/src/`.
Inter is under the SIL Open Font License, `brand/src/Inter-OFL.txt`.
