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
  shows one in the token status. The workspace lookup takes the same
  malformed tree answer as a failed lookup and shows its notice.
- **Workspace pattern `packages/**` also lists `packages` itself** when
  `packages/package.json` exists: a trailing `**` matches zero folders.
  npm and pnpm are believed to do the same; not checked against their
  source.

## Behavior to know

- **Health column starts hidden for existing users.** Saved column
  preferences lack the new key, so the column is hidden and last in order.
  New users see it after Outdated.
- **Health score varies with visible columns.** Issue ratio and
  vulnerabilities count only while their columns are shown.
- **Reload replays the share link.** A page reload refetches the `?step=`
  chain instead of returning to the built-in view.
- **Share link fetches on open.** A `step=url:` link fetches that URL
  without a click. Capped at 20 steps of 2,000 characters, http(s) only.
- **Fallback store never evicts.** It keeps whole registry documents,
  several MB for popular packages. With a GitHub token, star and issue
  counts of private repos are stored unencrypted until token purge; the
  token is never stored.
- **Not in a share link**: pasted and uploaded files, sort, search and
  column state.

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
  The offline store fallback lives in `utils/memoizeLookup.ts`.
- **`fetchRepoStars` guards an unknown host** although `parseRepoSlug`
  yields only `SUPPORTED_REPO_HOSTS`. Kept: it covers a host added to that
  list before it gets a stars fetcher.

## Verification

- **Untested on purpose**: the `isStillCached` check in `memoizeLookup`
  and the cancel latch in `fetchEntryDependencies`. Breaking the first
  costs at most one extra fetch after a cache clear mid-lookup; the second
  guards a state no navigation reaches, since a revisit always replaces
  the fetch token.

- **Manual check with a real fine-grained PAT** not done yet: save, Verify
  shows 5000, reload keeps it, Purge clears it. Also set a proxy and check
  that the user-URL fetch goes through it while `api.github.com` calls
  don't.
