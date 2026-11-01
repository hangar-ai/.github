# hangar-ai/.github

What the [hangar-ai](https://github.com/hangar-ai) organization shares between its repositories.

| Path                                  | What                                                                  |
| ------------------------------------- | --------------------------------------------------------------------- |
| `profile/README.md`                   | The organization's public page.                                       |
| `.github/workflows/kit-check.yml`     | The reusable workflow every kit repository calls.                     |
| `scripts/kit-check.mjs`               | What it runs: manifest, card, pages, personal data. Node alone.       |
| `brand/`                              | The avatar, banner and social preview, with their sources and `render.mjs`. |
| `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md` | The defaults of every repository here.           |

## Kit check

```sh
node scripts/kit-check.mjs <kit folder>
```

The manifest check **restates the rules of Hangar's Rust validator**
(`src-tauri/src/kits/manifest.rs`): it is not that validator, and Hangar reads every manifest again
itself. `scripts/lib/manifest.mjs` says where the two can differ. `node --test` here runs its cases,
translated by hand from that file's Rust tests.

## Future work

- Run those cases through the real Rust as well, to compare the two line by line. Nothing has done that.
- Check that every class a page names exists in Hangar UI from kit-check, rather than in each kit's tests.

The profile, the logo's colours and the type come from Hangar's site and `Logo.tsx`: see `brand/src/`.
Inter is under the SIL Open Font License, `brand/src/Inter-OFL.txt`.
