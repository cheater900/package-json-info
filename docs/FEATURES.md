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
- **GitHub file and folder URL** - a `/blob/<ref>/<path>` URL loads that
  file at that ref; a `/tree/<ref>/<path>` URL loads `package.json` in that
  folder. Workspaces are listed only for the root `package.json` of a ref
  without `/`.
- **Monorepo workspaces** - a GitHub repo URL whose root declares workspaces
  (`workspaces` in `package.json`, or `packages` in `pnpm-workspace.yaml`)
  gets a Workspace select listing each workspace folder. Picking one loads
  its `package.json` as a new history entry; `(root)` returns to the root.
  Listing costs one GitHub API request. When it fails, the root table still
  loads and a notice says so. Any other source that declares workspaces
  shows a hint to load the repo by GitHub URL.
- Workspace select lists at most 5,000 folders, from the first 100
  patterns of up to 200 characters each; a repo past a cap, or cut short
  by GitHub, shows a notice.

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
- Health score from 0 to 100, labelled good (70 and up), fair (40 and up)
  or poor. It averages the signals the row has: release age, deprecation,
  outdated version, maintainer count, open issue ratio and vulnerabilities.
  Issue ratio and vulnerabilities count only while their columns are
  visible. A tooltip lists the signals used.
- Known security advisories, via OSV
- Bundle size (min+gzip), via Bundlephobia
- Maintainers who publish the package on npm
- Deprecation notice, when npm marks the package deprecated
- Published source tree browser, from the npm tarball or a GitHub release tag
- Source tree lists at most 20,000 entries and shows files up to 2 MB; a
  larger tree shows a notice, a larger file an error

## Package drill-down / history

Every row has a button to load that package's own `package.json` as the new
input for the table. Clicking it:

- Fetches the `package.json` for that row's package.
- Replaces the current table with a new summary table generated from it.
- Records the navigation in a history stack, so the user can move back and
  forth between previously loaded tables (similar to browser back/forward)
  without re-fetching or losing earlier results.

### Share links

The address bar always holds a link to the current view. Each history
entry up to the current position becomes one `?step=` param: `url:<url>`,
`dep:<name>@<range>` or `ws:<workspace path>`. Opening the link replays the
steps in order, on top of the built-in `package.json`, and stops at the
first step that fails. Each step stops the table fetch of the step before.

- Pasted and uploaded files are not part of the link.
- A link holds at most 20 steps of up to 2,000 characters each.
- `?inputUrl=` still only fills the URL box.

## Table and UX

### Table / input data

- **Sorting and filtering** on any column (e.g. sort by weekly downloads,
  filter to packages not updated in over a year).
- **Search box** to jump to a specific package by name within a large table.
- **Validation of malformed/invalid input** - a broken `package.json` (bad
  JSON, missing `dependencies`/`devDependencies`) shows a clear inline error
  instead of a crash or a blank table.
- **Graceful per-field fallback** - when a data point can't be fetched for a
  package, the row still renders. `-` means the service has no data (no
  downloads, no repo URL). `?` in the error color means the lookup failed
  with no stored value; its tooltip gives the error.
- **Retry button** (↻) next to the name of a row that failed, is stale or
  has a failed lookup, also in the summary card. It refetches that one
  package.

### UX

- **Loading states** while data is being fetched, both for the initial table
  and for per-row/per-field lookups that resolve asynchronously.
- **Clear error messaging** for failed input loads (bad git URL, unreachable
  file URL, invalid upload) and for failed per-package metadata lookups.
- **In-memory metadata cache**: rows that share a package or repository
  share one request, and failed lookups are retried instead of cached.
- **Offline fallback**: each successful lookup is stored in IndexedDB. When
  a live lookup fails (offline, rate limit, outage), the row shows the
  stored value, and a "stale" badge next to the name gives its date.
  Returning to the table through history retries the lookup. Without
  IndexedDB there is no fallback.
- **Column preferences**: visibility, drag-and-drop order and abbreviated
  labels, stored in `localStorage`.
- **Responsive layout**: the page never scrolls sideways down to 360 px;
  only the table does, and its first column stays pinned at the left. At
  700 px and below, the URL field takes its own line, modals fill the
  screen and the source tree stacks the file list above the file view.

## Export

Export buttons next to the search box save both tables, Deps and Dev Deps,
into one file. The file holds what the tables show: Name, then the visible
columns in their current order, rows matching the search box. Rows keep
`package.json` order; table sorting is not applied. Buttons stay disabled
while a table loads. The file is named `<package name>-dependencies.<ext>`.

- **CSV**: one table, UTF-8 with BOM, a leading Section column. Cells that a
  spreadsheet would run as a formula (`=`, `+`, `@`, `-1`) get a leading `'`.
- **XLSX**: one sheet per table, bold frozen header row.
- **Markdown**: a heading and a GFM table per table.
- **HTML**: one standalone page with inline styles, no scripts or external
  files, so it opens offline.
- **PDF**: landscape, each table on its own page. Columns past the page
  width continue on the next page, repeating Name.

Source Code Tree buttons are left out; the Source Code link exports its
URL. Error rows keep their message, failed lookups their `?`.

## Settings

A gear button at the top right opens a settings dropdown. A dot on the gear
shows when a GitHub token is set.

- **GitHub token**: paste a personal access token to raise the GitHub API
  rate limit from 60 to 5000 requests per hour. Save stores it encrypted
  (AES-GCM, with a non-extractable key in IndexedDB) and refetches the
  tables. A failed save removes any stored token. Verify shows the
  remaining quota, or says GitHub rejected the token. Purge deletes it
  and clears cached and stored lookups.
  The token is sent only to `api.github.com`, never through the proxy.
  Encryption protects it on disk, not from scripts on the page, so use a
  fine-grained token with no permissions.
- **Network**: CORS proxy, request timeout and parallel fetches per table.
  A proxy containing `{url}` gets the encoded target URL there; otherwise
  the target URL is appended. Changing the proxy refetches the tables.
- **Display**: theme (Green terminal, Light, or System to follow the OS),
  font size (87.5% to 125%) and padding (75% to 125%).
