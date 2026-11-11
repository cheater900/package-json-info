# Known issues

Issues left as they are, each with its reason. They may never be fixed.
Gaps that should be fixed are in [NOTES.md](NOTES.md).

## Security

- **Proxy may be `http:`.** Request URLs then reach the proxy in
  cleartext. Allowed so a localhost proxy works.
- **Proxy fetches any URL it is given.** A crafted `?inputUrl=` link or a
  registry `dist.tarball` URL makes the user's proxy fetch that URL; the
  response goes only to that user. Comes with having a proxy at all.
- **Proxy prefix without trailing `/`** (`https://p.example` + target)
  builds a broken host such as `p.examplehttps`. The requests fail; no real
  TLD matches.
- **Dev-only `npm audit` findings**: moderate advisories in the
  `@vue/test-utils` -> js-beautify -> editorconfig/minimatch/glob chain.
  Not in the bundle. `npm audit fix --force` downgrades `@vue/test-utils`;
  wait for an upstream fix or add `overrides`.

## Reliability

- **Late token load can purge a newer token.** Only when IndexedDB hangs
  past `TOKEN_LOAD_TIMEOUT_MS`, a token is saved meanwhile, and the late
  decrypt then fails. The save waits behind the same stuck IndexedDB, so
  this is very unlikely.
- **No size cap on the user-URL `package.json` fetch** (`fetchText`). The
  user picks that URL.
- **Malformed tarball with both file `a` and directory `a/...`** gives
  duplicate Vue keys in the file tree. Cosmetic.
- **`URL.canParse`** needs Safari 17+.
- **Brace sets in workspace patterns** (`packages/{a,b}`) are not
  expanded, so those workspaces are not listed. Rare in practice.
- **`pnpm-workspace.yaml`** is read by a small line parser that takes only
  the top-level `packages` list. Anchors, multi-document files and
  `catalog:` entries are ignored; a full YAML parser is not worth the
  dependency.
- **`workspace:` dependency ranges** (`workspace:*`) are looked up on npm
  by package name. A private workspace package shows an empty row.
