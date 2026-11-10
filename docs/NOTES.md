# Notes

Known gaps and decisions left open by the audits. Not planned yet; an item
moves to [ROADMAP.md](ROADMAP.md) once planned. Feature ideas live in
[IDEA.md](IDEA.md).

## Security

- **No CSP.** The repo has no hosting config, and a `<meta>` CSP breaks
  Vite's dev server. On the deploy host, set `script-src 'self';
  object-src 'none'; base-uri 'none'; frame-ancestors 'none'`.
  `connect-src` must stay open (`https: http:`): the URL input, tarball
  URLs and the CORS proxy can be any URL. Without a CSP, an XSS could use
  the decrypted GitHub token.
- **Proxy may be `http:`.** Request URLs then reach the proxy in
  cleartext. Allowed so a localhost proxy works.
- **Proxy fetches any URL it is given.** A crafted `?inputUrl=` link or a
  registry `dist.tarball` URL makes the user's proxy fetch that URL; the
  response goes only to that user. Comes with having a proxy at all.
- **Proxy prefix without trailing `/`** (`https://p.example` + target)
  builds a broken host such as `p.examplehttps`. The requests fail; no real
  TLD matches.
- **Dev-only `npm audit` findings**: moderate advisories in the
  `@vue/test-utils` → js-beautify → editorconfig/minimatch/glob chain. Not
  in the bundle. `npm audit fix --force` downgrades `@vue/test-utils`;
  wait for an upstream fix or add `overrides`.

## Reliability

- **Two open tabs overwrite each other's settings.** Each tab writes its
  whole settings object. See tab sync in [IDEA.md](IDEA.md).
- **Late token load can purge a newer token.** Only when IndexedDB hangs
  past `TOKEN_LOAD_TIMEOUT_MS`, a token is saved meanwhile, and the late
  decrypt then fails. The save waits behind the same stuck IndexedDB, so
  this is very unlikely.
- **Tarball download keeps running after the source-tree modal closes.**
  Bounded by the fetch timeout and the unpacked size cap. Cancelling needs
  `AbortSignal.any`.
- **No size cap on the user-URL `package.json` fetch** (`fetchText`). The
  user picks that URL.
- **Only the registry document is type-checked.** A wrong type from the
  downloads, stars, issue-count, bundle-size or OSV services shows as odd
  cell text. A malformed GitHub tree answer shows a raw engine error in the
  source-tree modal; a `/rate_limit` answer without `rate` shows one in the
  token status.
- **Malformed tarball with both file `a` and directory `a/…`** gives
  duplicate Vue keys in the file tree. Cosmetic.
- **`URL.canParse`** needs Safari 17+.

## Display

- **Light theme contrast**: vue-json-pretty string values keep the
  library's bright green, and the name-cell cursor SVG (a data URL, so no
  CSS variable) stays green.
- **Light theme may flash dark** for one frame on load: CSS paints before
  `main.js` sets `data-color-scheme`. An inline script in `index.html`
  reading the stored settings would fix it.

## Code

- **`npmPackage.ts` imports `tableColumns`**: the api layer picks lookups
  by UI column keys. Works because the keys equal `PackageInfo` fields.
- **`DependencyCell.vue`**: column key `sourceCodeTree` does not match the
  field name `sourceTree`.
- **`npmPackage.ts` does several jobs**: registry document, downloads, OSV,
  Bundlephobia, repo lookups and their caches. One `clearPackageInfoCache`
  ties the caches together; a split needs a shared cache registry first.
- **`fetchRepoStars` guards an unknown host** although `parseRepoSlug`
  yields only `SUPPORTED_REPO_HOSTS`. Kept: it covers a host added to that
  list before it gets a stars fetcher.
- **CHANGELOG groups by day**, in flat bullets. Month, scope and area
  grouping would need a rewrite of the whole file.

## Verification

- **Manual check with a real fine-grained PAT** not done yet: save, Verify
  shows 5000, reload keeps it, Purge clears it. Also set a proxy and check
  that the user-URL fetch goes through it while `api.github.com` calls
  don't.
