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
- **`retryFailedRows` keeps fetching after navigation** to another
  entry. Only wastes requests.
- **`times[range]` reads inherited keys**: range like `constructor` makes
  `versionDate` a Function. Every formatter and filter shows "-".
- **GitLab subgroup repos** (`group/sub/project`) parse as `group/sub`,
  so stars and source link point at wrong project. Fix needs slugs with
  more than two segments.

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
  No cap on dependency count: crafted package.json with thousands of
  dependencies fetches every row, using GitHub token for stars and 4
  issue searches per repo, so it burns token rate limit. Options: cap
  rows per table, or ask before share-link replay above N dependencies.
- **Fallback store never evicts.** Keeps whole registry documents, several
  MB for popular packages. With GitHub token, star and issue counts of
  private repos stay stored unencrypted until token purge. Token itself
  never gets stored.
- **Not in share link**: pasted and uploaded files, sort, search and
  column state.
- **Report fetches hidden columns.** Generate report loads every column
  filter sections read, as export does for picked columns. Health score in
  report can differ from table: issue ratio and vulnerabilities count
  there even while their columns stay hidden.
- **Report wording stays factual.** No advice words, no judgment beyond
  preset labels. Unit test enforces word list; new report text keeps it.

## Display

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
- **Export lock duplicated**: `ReportDialog` `exportPdf` repeats lock and
  `setTimeout` unlock of `ExportDialog` `unlockAfterQueuedClicks`. Shared
  composable would remove both copies.
- **`stubDownload` duplicated** in `ReportDialog.test.ts` and
  `ExportDialog.test.ts`; belongs in `tests/helpers`.
- **`isoDate` lives in `buildReport.ts`**; belongs beside `fmtDate` in
  `dependencyRowFormatting.ts`.
- **Report replaces open modal**: modal opened while report loads (for
  example network log) gets replaced when report finishes.
- **Markdown heading ending in ` #`** loses that `#`: GFM reads it as
  closing sequence. Report headings come from i18n text, so no current
  heading hits it.

## Verification

- **Untested on purpose**: `isStillCached` check in `memoizeLookup` and
  cancel latch in `fetchEntryDependencies`. Breaking first costs at most
  one extra fetch after cache clear mid-lookup. Second guards state no
  navigation reaches, since revisit always replaces fetch token.

- **Manual check with real fine-grained PAT** not done yet: save, Verify
  shows 5000, reload keeps it, Purge clears it. Also set proxy, check
  user-URL fetch goes through it while `api.github.com` calls do not.
