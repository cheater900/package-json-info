# Features

Implemented features. Planned work lives in [ROADMAP.md](ROADMAP.md), untried ideas in
[IDEA.md](IDEA.md).

## Input methods

App accepts `package.json` from these sources:

- **Clipboard content** - paste raw JSON.
- **Git URL** - point at repository containing `package.json`.
- **File upload** - pick local `package.json` file.
- **File URL** - fetch `package.json` from remote URL.
- **Repo URL** - paste GitHub/GitLab/Codeberg repo URL, not only raw file
  URL. App finds `package.json` on `main` or `master` branch.
- **GitHub file and folder URL** - `/blob/<ref>/<path>` URL loads that file
  at that ref. `/tree/<ref>/<path>` URL loads `package.json` in that folder.
  Workspaces list only for root `package.json` of ref without `/`.
- **Monorepo workspaces** - GitHub repo URL whose root declares workspaces
  (`workspaces` in `package.json`, or `packages` in `pnpm-workspace.yaml`)
  gets Workspace select listing each workspace folder. Picking one loads its
  `package.json` as new history entry; `(root)` returns to root. Listing
  costs one GitHub API request. On failure, root table still loads and
  notice says so. Other sources that declare workspaces show hint to load
  repo by GitHub URL.
- Workspace select lists at most 5,000 folders, from first 100 patterns of
  up to 200 characters each. Repo past cap, or cut short by GitHub, shows
  notice.

## Output: the dependency summary table

After `package.json` loads, app parses its `dependencies` and
`devDependencies` and renders one row per package. Each row includes, when
data exists:

- Source code URL (repository link)
- Last updated date
- Last released date
- Open PR count
- Closed PR count
- npm weekly downloads
- Stars (GitHub / GitLab / Codeberg, whichever hosts source)
- Last commit date on default branch within past year (GitHub only,
  hidden by default). One request per repo, shared by its packages.
- Open issues count
- Closed issues count
- List of package's own dependencies
- "Load this package's table" button (see below)
- License, with warning icon for copyleft or missing licenses (exports
  write `⚠` instead)
- Outdated version indicator: declared version or range against latest
  published version
- Health score from 0 to 100, labelled good (70 and up), fair (40 and up)
  or poor. Score averages signals row has: release age, deprecation,
  outdated version, maintainer count, open issue ratio and vulnerabilities.
  Issue ratio and vulnerabilities count only when their columns were visible
  at fetch time. Tooltip lists signals used.
- Known security advisories, via OSV
- Bundle size (min+gzip), via Bundlephobia
- Maintainers who publish package on npm
- Deprecation notice, when npm marks package deprecated
- Published source tree browser, from npm tarball or GitHub release tag
- Source tree lists at most 20,000 entries and shows files up to 2 MB.
  Larger tree shows notice, larger file shows error.

## Package drill-down / history

Every row has Actions column, right after Name, with three buttons:

- View (eye icon) opens package summary card.
- Reload (circular arrow) refetches row's failed lookups.
- Load (down arrow) loads that package's own `package.json` as new table
  input.

Clicking cells does nothing. Load:

- Fetches `package.json` for row's package.
- Replaces current table with new summary table generated from it.
- Records navigation in history stack. User moves back and forth between
  loaded tables (like browser back/forward) without re-fetch or lost
  results.

### Share links

Address bar always holds link to current view. Each history entry up to
current position becomes one `?step=` param: `url:<url>`,
`dep:<name>@<range>` or `ws:<workspace path>`. Opening link replays steps in
order, on top of built-in `package.json`, and stops at first failing step.
Each step stops table fetch of step before.

- Pasted and uploaded files are not part of link.
- Link holds at most 20 steps of up to 2,000 characters each.
- `?inputUrl=` still only fills URL box.

## Table and UX

### Table / input data

- **Sorting** on any sortable column (e.g. sort by weekly downloads).
- **Filters panel** between search box and tables, toggled by
  **Filters** button beside search box: fixed health presets, one choice
  per section, sections combined. Sections: last published, last updated,
  installed version age, commit activity, open PR ratio, open issue ratio,
  vulnerabilities, bundle size, health score, status (deprecated, outdated,
  major version behind), maintainers, adoption, license, source. Ratio
  presets need 10 or more PRs or issues; fewer counts as unknown. Filter on
  hidden column shows that column and fetches its data; filter waits
  until data arrives. Hiding column clears filters reading it. While any filter
  is on, rows that failed to load stay hidden. Dev dependencies ignore
  bundle size filter. Filters last for session only: not saved, not in
  share link, not applied to export. Button badge counts active filters;
  "Clear all" resets them.
- **Search box** jumps to package by name in large table. No match shows
  "No dependencies matched search" row.
- **Validation of malformed/invalid input** - broken `package.json` (bad
  JSON, missing `dependencies`/`devDependencies`) shows inline error, not
  crash or blank table.
- **Graceful per-field fallback** - when data point fetch fails, row still
  renders. `-` means service has no data (no downloads, no repo URL). `?` in
  error color means lookup failed with no stored value; its tooltip gives
  error.
- **Retry failed fetches** button below table with rows that failed, are
  stale or have failed lookup. Button refetches those rows only. Row's own
  Reload action refetches one row.

### UX

- **Loading states** during fetch, for initial table and for per-row/
  per-field lookups that resolve asynchronously.
- **Error messages** for failed input loads (bad git URL, unreachable file
  URL, invalid upload) and failed per-package metadata lookups.
- **In-memory metadata cache**: rows sharing package or repository share one
  request. Failed lookups retry, not cached.
- **Offline fallback**: IndexedDB stores each successful lookup. When live
  lookup fails (offline, rate limit, outage), row shows stored value, and
  "stale" badge next to name gives its date. Return to table through history
  retries lookup. No IndexedDB -> no fallback.
- **Column icons**: each column has own icon in header, column picker,
  export form and summary card. Abbreviated labels keep icon.
- **Column preferences**: visibility, drag-and-drop order and abbreviated
  labels, stored in `localStorage`. Abbreviations: VER (Version), OOD
  (Outdated), HS (Health), WDL (Weekly downloads), SRC (Source Code link),
  TREE (Source Code Tree), STAR (Git stars), OPR/CPR (Open/Closed PRs),
  OIS/CIS (Open/Closed issues), DEPS (Dependencies), LIC (License), DEPR
  (Deprecated), VULN (Vulnerabilities), GZIP (Bundle size), MAINT
  (Maintainers). Other labels shrink to initials. Hiding column is instant, fetches
  nothing. Showing column keeps rows on screen; its cells show loading icon
  until data arrives.
- **Responsive layout**: page never scrolls sideways down to 360 px. Only
  table scrolls, first column pinned left. At 700 px and below, URL field
  takes own line, modals fill screen, source tree stacks file list above
  file view.
- **Modals** show centered title on top, close button on right. Escape or
  click outside also closes them.
- **Animations**: modals slide in from screen top to center and back up on
  close. Columns accordion and Filters panel slide open and closed. OS
  reduced motion setting turns slides off.

## Export

**Export** button below each table, right of Expand table, opens form:

- **Tables**: Deps and Dev Deps checkboxes. Only table of clicked button
  starts checked; checking other one exports both. Download stays disabled
  with none checked.
- **Columns**: every data column in current column order, visible ones
  checked. Name always exports. Checking column tables never loaded fetches
  its data, with spinner beside it; Download waits for fetch. Tables do not
  change or reload.
- **Format**: CSV (default), XLSX, Markdown, HTML or PDF.
- **Download** saves one file, closes form.

File holds every row of each checked table; search box does not apply. Rows
keep `package.json` order; table sorting does not apply. Export button stays
disabled while table or newly shown column loads. Download stays disabled
while export runs, so double click saves one file. File name:
`<package name>-dependencies.<ext>`.

- **CSV**: one table, UTF-8 with BOM, leading Section column. Cells
  spreadsheet would run as formula (starting with `=`, `+`, `@`, tab, CR, or
  `-` plus text) get leading `'`.
- **XLSX**: one sheet per table, bold frozen header row.
- **Markdown**: heading and GFM table per table. Cell text is
  backslash-escaped, so registry text cannot inject HTML, links, images or
  math (`$`).
- **HTML**: one standalone page, inline styles, no scripts or external
  files, so it opens offline. Content-Security-Policy meta tag blocks
  scripts and remote loads.
- **PDF**: landscape, each table on own page. Columns past page width
  continue on next page, repeating Name.

Export leaves out Source Code Tree buttons; Source Code link exports its
URL. Error rows keep message, failed lookups keep `?`.

## Report

**Generate report** button below both tables shows "Loading..." while it
fetches every column filter sections read, then opens report modal.
Report covers rows tables show: search box and active filters apply.

- **Overview**: generation time (UTC), package count per table, search
  query, active filters.
- **Data coverage**: fetched rows, fetch errors with message, rows using
  stored values, failed lookups per field.
- **Data sources**: each service with its URL and fields it provides.
- **One section per filter section**: definition of value and its source,
  preset count table per table with share of fetched rows, then matching
  packages per preset with their values. Dates print as UTC `YYYY-MM-DD`.
  Deprecation messages print quoted, verbatim.

Report states facts only: no advice, no judgment beyond preset labels.
Health score section names its signals, weights and band thresholds.
Modal shows report as headings, lists and tables. **Export Markdown** and
**Export PDF** buttons stick to modal bottom. File name:
`<package name>-report.<ext>`. Markdown escapes leading `#`, `-`, `+` and
`1.` in lines, so package names cannot turn into headings or lists. PDF is
portrait; long lists and tables flow onto next pages.

## CLI

`package-json-info <source>` prints dependency tables of package.json as
Markdown to stdout, with default visible columns.

- **Source**: existing file path, directory (reads its `package.json`),
  http(s) URL (repo URLs resolve to their package.json, as in web app) or
  npm spec (`name` or `name@version`). UTF-8 BOM in file is dropped.
- **Pipe-safe output**: control characters from registry data and
  package.json are stripped before printing; piping into `head` exits
  clean.
- **`--no-dev`** skips devDependencies.
- **Export**: `--format <csv|xlsx|markdown|html|pdf>` writes export file
  instead of printing. `--output <file>` names it; default
  `<package>-dependencies.<ext>` in current dir.
- **Report**: `--report md` prints dependency report to stdout,
  `--report pdf` writes `<package>-report.pdf` (or `--output`). Report
  covers all rows: no search, no filters.
- **Settings**: `--proxy-url`, `--timeout <ms>`, `--concurrency <n>`. Env
  fallbacks: `PJI_PROXY_URL`, `PJI_FETCH_TIMEOUT_MS`,
  `PJI_FETCH_CONCURRENCY`. Flag wins over env. `GITHUB_TOKEN` env raises
  GitHub rate limit; no flag, so token stays out of shell history.
- **Offline cache**: last good lookups go to
  `$XDG_CACHE_HOME/package-json-info` (else `~/.cache/package-json-info`),
  owner-only (dir 0700, files 0600). Failed fetch serves stored value.
  `--no-cache` skips cache.
- **Exit codes**: 0 success, 1 load, parse or write failure (message on
  stderr), 2 bad arguments.

## Settings

Gear button at top right opens settings dropdown. Dot on gear shows when
GitHub token is set.

- **Display**: theme (Green terminal, Light, or System to follow OS), font
  size (87.5% to 125%) and padding (75% to 125%).
- **Network**: CORS proxy, request timeout and parallel fetches per table.
  Proxy containing `{url}` gets encoded target URL there; else target URL is
  appended. Proxy change refetches tables.
- **GitHub token**: paste personal access token to raise GitHub API rate
  limit 60 -> 5000 requests per hour. Save stores token encrypted (AES-GCM,
  non-extractable key in IndexedDB) and refetches tables. Failed save
  removes any stored token. Verify shows remaining quota, or says GitHub
  rejected token. Purge deletes token, clears cached and stored lookups.
  Token goes only to `api.github.com`, never through proxy. Encryption
  protects token on disk, not from scripts on page. Use fine-grained token
  with no permissions.

## Network logs

**View network logs** at end of settings Network section opens modal. Modal
lists every request app sent this page load, newest first:

- **State**: green check for success, red cross for failure, yellow
  question mark while pending. Any non-2xx answer, 404 included, counts as
  failure. Body that breaks off mid-download (timeout, dropped connection)
  also counts as failure.
- **Time** request started, **method** badge and target **URL** (never
  proxied one).
- **Package**: name of loaded package.json whose dependencies request
  served. `-` outside tables.
- **Dependencies** and **columns** request fetched data for. Request shared
  by several dependencies lists them all.
- Long text clips with ellipsis: method and URL after 80 characters,
  package, dependency and column text at table's default width. Hover shows
  zoom-in cursor. Click expands text, second click collapses it.
- **Status** badge, or `-` without response; hover shows network or body
  error. **Size** of decoded body, `-` until app reads all of it. Bodies app
  never reads, such as most 404 answers, stay `-`.

Summary line below table counts total, failed, pending and successful
requests. Failed rows get **retry** button. Table rows of request's
dependencies that failed, are stale or have failed lookup refetch as with
Retry failed fetches. Without such rows, request resends and outcome shows
as new entry.

Log lives in memory only, keeps latest 1000 requests. Replay never stores
GitHub token. Replay adds token current at retry time, so purged token is
not sent again.
