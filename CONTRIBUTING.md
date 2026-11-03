# Contributing

Please follow the [code of conduct](CODE_OF_CONDUCT.md). For a security problem, read
[SECURITY.md](SECURITY.md) and do not open a public issue.

## A bug or a fix in a kit

Open an issue or a pull request on that kit's repository. `node --test` runs its tests, with Node alone.

## Propose a kit

The organization keeps a small library. A kit of yours does not have to live here: it lives in your
own repository, and the catalog lists it.

1. **Make it.** Start from [kit-template](https://github.com/hangar-ai/kit-template), and read
   [the kit contract](https://github.com/hangar-ai/hangar/blob/main/docs/kits.md).
2. **Check it.** Call [kit-check](.github/workflows/kit-check.yml) from your CI, as the template does. It
   looks at the manifest, your tests, your pages, the module of a native tab, and personal data in your files and history.
3. **Tag it.** The tag is `v` and the manifest's version, like `v0.1.0`. Do not move a tag once it is listed.
4. **List it.** In [the catalog](https://github.com/hangar-ai/catalog), run
   `node scripts/catalog.mjs add <owner/repo> <tag>` and open a pull request. The template says what a
   reviewer looks at: hooks, commands, and whatever else runs by itself.

A community kit stays marked unverified. `verified` means the organization maintains it.
