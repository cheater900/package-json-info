# Notes

Gaps and decisions left open by the audits. Not planned yet; an item moves
to [ROADMAP.md](ROADMAP.md) once planned. Feature ideas are in
[IDEA.md](IDEA.md). Issues that stay as they are go in
[KNOWN_ISSUES.md](KNOWN_ISSUES.md).

## Security

- **No CSP.** The repo has no hosting config, and a `<meta>` CSP breaks
  Vite's dev server. On the deploy host, set `script-src 'self';
  object-src 'none'; base-uri 'none'; frame-ancestors 'none'`.
  `connect-src` must stay open (`https: http:`): the URL input, tarball
  URLs and the CORS proxy can be any URL. Without a CSP, an XSS could use
  the decrypted GitHub token.

## Reliability

- **Two open tabs overwrite each other's settings.** Each tab writes its
  whole settings object. See tab sync in [IDEA.md](IDEA.md).
- **Tarball download keeps running after the source-tree modal closes.**
  Bounded by the fetch timeout and the unpacked size cap. Cancelling needs
  `AbortSignal.any`.
- **Only the registry document is schema-checked at runtime.** A wrong
  type from the downloads, stars, issue-count, bundle-size or OSV services
  shows as odd cell text. A malformed GitHub tree answer shows a raw engine
  error in the source-tree modal; a `/rate_limit` answer without `rate`
  shows one in the token status.

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

## Verification

- **Manual check with a real fine-grained PAT** not done yet: save, Verify
  shows 5000, reload keeps it, Purge clears it. Also set a proxy and check
  that the user-URL fetch goes through it while `api.github.com` calls
  don't.
