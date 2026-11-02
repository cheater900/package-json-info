# Features

Implemented features. Planned work lives in [ROADMAP.md](ROADMAP.md), untried ideas in
[IDEA.md](IDEA.md).

## Input methods

The app accepts a `package.json` from any of the following sources:

- **Clipboard content** - paste the raw JSON directly.
- **Git URL** - point at a repository containing a `package.json`.
- **File upload** - pick a local `package.json` file.
- **File URL** - fetch a `package.json` from a remote URL.
- **Repo URL** - paste a GitHub/GitLab/Codeberg repo URL directly (not just a
  raw file URL); the app finds `package.json` on the `main` or `master` branch.

## Output: the dependency summary table

Once a `package.json` is loaded, the app parses its `dependencies` and
`devDependencies` and renders one row per package. Each row includes, when
the data is available:

- Source code URL (repository link)
- Last updated date
- Last released date
- Open PR count
- Closed PR count
- npm weekly downloads
- Stars (GitHub / GitLab / Codeberg, whichever hosts the source)
- Open issues count
- Closed issues count
- List of the package's own dependencies
- A "load this package's table" button (see below)
- License, with a warning badge for copyleft or missing licenses
- Outdated version indicator: the declared version or range against the
  latest published version
- Known security advisories, via OSV
- Bundle size (min+gzip), via Bundlephobia
- Maintainers who publish the package on npm
- Deprecation notice, when npm marks the package deprecated
- Published source tree browser, from the npm tarball or a GitHub release tag

## Package drill-down / history

Every row has a button to load that package's own `package.json` as the new
input for the table. Clicking it:

- Fetches the `package.json` for that row's package.
- Replaces the current table with a new summary table generated from it.
- Records the navigation in a history stack, so the user can move back and
  forth between previously loaded tables (similar to browser back/forward)
  without re-fetching or losing earlier results.

## Table and UX

### Table / input data

- **Sorting and filtering** on any column (e.g. sort by weekly downloads,
  filter to packages not updated in over a year).
- **Search box** to jump to a specific package by name within a large table.
- **Validation of malformed/invalid input** - a broken `package.json` (bad
  JSON, missing `dependencies`/`devDependencies`) shows a clear inline error
  instead of a crash or a blank table.
- **Graceful per-field fallback** - when a data point can't be fetched for a
  package (e.g. no npm downloads data, no repo URL), the row still renders
  with that cell clearly marked as unavailable, rather than breaking the row
  or the table.

### UX

- **Loading states** while data is being fetched, both for the initial table
  and for per-row/per-field lookups that resolve asynchronously.
- **Clear error messaging** for failed input loads (bad git URL, unreachable
  file URL, invalid upload) and for failed per-package metadata lookups.
- **In-memory metadata cache**: rows that share a package or repository
  share one request, and failed lookups are retried instead of cached.
- **Column preferences**: visibility, drag-and-drop order and abbreviated
  labels, stored in `localStorage`.

## Settings

A gear button at the top right opens a settings dropdown. A dot on the gear
shows when a GitHub token is set.

- **GitHub token**: paste a personal access token to raise the GitHub API
  rate limit from 60 to 5000 requests per hour. Save stores it encrypted
  (AES-GCM, with a non-extractable key in IndexedDB) and refetches the
  tables. Verify shows the remaining quota, or says GitHub rejected the
  token. Purge deletes it. The token is sent only to `api.github.com`,
  never through the proxy. Encryption protects it on disk, not from
  scripts on the page, so use a fine-grained token with no permissions.
- **Network**: CORS proxy, request timeout and parallel fetches per table.
  A proxy containing `{url}` gets the encoded target URL there; otherwise
  the target URL is appended. Changing the proxy refetches the tables.
- **Display**: theme (Green terminal, Light, or System to follow the OS),
  font size (87.5% to 125%) and padding (75% to 125%).
