# Notes

Gaps and decisions audits left open. Not planned yet; item moves to
[ROADMAP.md](ROADMAP.md) once planned. Feature ideas live in
[IDEA.md](IDEA.md). Issues staying as is go in
[KNOWN_ISSUES.md](KNOWN_ISSUES.md).

## Security

- **No CSP.** Repo has no hosting config, and `<meta>` CSP breaks Vite dev
  server. On deploy host, set `script-src 'self'; object-src 'none';
  base-uri 'none'; frame-ancestors 'none'`. `connect-src` must stay open
  (`https: http:`): URL input, tarball URLs and CORS proxy can be any URL.
  Without CSP, XSS could use decrypted GitHub token.

## Reliability

- **Two open tabs overwrite each other's settings.** Each tab writes whole
  settings object. See tab sync in [IDEA.md](IDEA.md).
- **Tarball download keeps running after source-tree modal closes.** Fetch
  timeout and unpacked size cap bound it. Cancelling needs
  `AbortSignal.any`.
- **Only registry document gets schema-checked at runtime.** Wrong type
  from downloads, stars, issue-count, bundle-size or OSV services shows as
  odd cell text. Malformed GitHub tree answer shows raw engine error in
  source-tree modal. `/rate_limit` answer without `rate` shows one in token
  status. Workspace lookup treats same malformed tree answer as failed
  lookup and shows its notice.
- **Workspace pattern `packages/**` also lists `packages` itself** when
  `packages/package.json` exists: trailing `**` matches zero folders. npm
  and pnpm likely do same; not checked against their source.

## Behavior to know

- **Health column starts hidden for existing users.** Saved column
  preferences lack new key, so column is hidden and last in order. New
  users see it after Outdated.
- **Health score varies with visible columns.** Issue ratio and
  vulnerabilities count only while their columns show.
- **Reload replays share link.** Page reload refetches `?step=` chain
  instead of returning to built-in view.
- **Share link fetches on open.** `step=url:` link fetches that URL without
  click. Capped at 20 steps of 2,000 characters, http(s) only.
- **Fallback store never evicts.** Keeps whole registry documents, several
  MB for popular packages. With GitHub token, star and issue counts of
  private repos stay stored unencrypted until token purge. Token itself
  never gets stored.
- **Not in share link**: pasted and uploaded files, sort, search and
  column state.

## Display

- **Filters panel runs past screen bottom** until search row sticks to
  top. Panel `max-height` is `100vh - 96px`, same as settings menu, so it
  fits only once search row is stuck. Page scroll still reaches it.
- **Light theme contrast**: vue-json-pretty string values keep library's
  bright green. Name-cell cursor SVG (data URL, so no CSS variable) stays
  green.
- **Light theme may flash dark** for one frame on load: CSS paints before
  `main.js` sets `data-color-scheme`. Fix: inline script in `index.html`
  reading stored settings.

## Code

- **`npmPackage.ts` imports `tableColumns`**: api layer picks lookups by
  UI column keys. Works because keys equal `PackageInfo` fields.
- **`DependencyCell.vue`**: column key `sourceCodeTree` does not match
  field name `sourceTree`.
- **`npmPackage.ts` does several jobs**: registry document, downloads,
  OSV, Bundlephobia, repo lookups and their caches. One
  `clearPackageInfoCache` ties caches together; split needs shared cache
  registry first. Offline store fallback lives in
  `utils/memoizeLookup.ts`.
- **`fetchRepoStars` guards unknown host** although `parseRepoSlug`
  yields only `SUPPORTED_REPO_HOSTS`. Kept: covers host added to that list
  before it gets stars fetcher.

## Verification

- **Untested on purpose**: `isStillCached` check in `memoizeLookup` and
  cancel latch in `fetchEntryDependencies`. Breaking first costs at most
  one extra fetch after cache clear mid-lookup. Second guards state no
  navigation reaches, since revisit always replaces fetch token.

- **Manual check with real fine-grained PAT** not done yet: save, Verify
  shows 5000, reload keeps it, Purge clears it. Also set proxy, check
  user-URL fetch goes through it while `api.github.com` calls do not.
