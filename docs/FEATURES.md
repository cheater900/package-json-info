# Features

Checked boxes are implemented. Unchecked boxes are planned or under consideration.

## Input methods

The app accepts a `package.json` from any of the following sources:

- [x] **Clipboard content** - paste the raw JSON directly.
- [x] **Git URL** - point at a repository containing a `package.json`.
- [x] **File upload** - pick a local `package.json` file.
- [x] **File URL** - fetch a `package.json` from a remote URL.

## Output: the dependency summary table

Once a `package.json` is loaded, the app parses its `dependencies` and
`devDependencies` and renders one row per package. Each row includes, when
the data is available:

- [x] Source code URL (repository link)
- [x] Last updated date
- [x] Last released date
- [x] Open PR count
- [x] Closed PR count
- [x] npm weekly downloads
- [x] Stars (GitHub / GitLab / Codeberg, whichever hosts the source)
- [x] Open issues count
- [x] Closed issues count
- [x] List of the package's own dependencies
- [x] A "load this package's table" button (see below)

## Transitive dependency resolution

Direct `dependencies`/`devDependencies` are only the tip of what a package
manager actually installs. To show the real footprint of a `package.json`,
the app recursively walks each package's own dependency tree - fetching each
dependency's `package.json` in turn, then its dependencies' `package.json`
files, and so on - the same way a package manager would resolve the tree.

**Not implemented yet.** This should be done gracefully:

- [ ] **Deduplicate** shared dependencies encountered multiple times across the
      tree, so they're only counted once (mirroring how a package manager
      hoists/dedupes).
- [ ] **Cap recursion depth / detect cycles** so a malformed or circular
      dependency graph can't cause runaway fetching.
- [ ] **Tolerate partial failures** - if a nested package's metadata can't be
      fetched (rate limits, missing registry entry, network error), skip it and
      continue rather than failing the whole resolution.
- [ ] **Surface the total resolved dependency count** (direct + transitive) as
      a summary figure, distinct from the direct dependency count already shown
      per row.

## Package drill-down / history

Every row has a button to load that package's own `package.json` as the new
input for the table. Clicking it:

- [x] Fetches the `package.json` for that row's package.
- [x] Replaces the current table with a new summary table generated from it.
- [x] Records the navigation in a history stack, so the user can move back and
      forth between previously loaded tables (similar to browser back/forward)
      without re-fetching or losing earlier results.

## Desired features (must-have)

Beyond the core goals above, these are required for a first usable version -
not optional extras to consider later.

### Table / input data

- [x] **Sorting and filtering** on any column (e.g. sort by weekly downloads,
      filter to packages not updated in over a year).
- [x] **Search box** to jump to a specific package by name within a large table.
- [x] **Validation of malformed/invalid input** - a broken `package.json` (bad
      JSON, missing `dependencies`/`devDependencies`) shows a clear inline error
      instead of a crash or a blank table.
- [x] **Graceful per-field fallback** - when a data point can't be fetched for a
      package (e.g. no npm downloads data, no repo URL), the row still renders
      with that cell clearly marked as unavailable, rather than breaking the row
      or the table.

### UX

- [x] **Loading states** while data is being fetched, both for the initial table
      and for per-row/per-field lookups that resolve asynchronously.
- [x] **Clear error messaging** for failed input loads (bad git URL, unreachable
      file URL, invalid upload) and for failed per-package metadata lookups.
- [ ] **Responsive layout** - the table stays usable on mobile/narrow viewports.
- [ ] **Keyboard-accessible interactions and semantic markup** (proper focus
      order, ARIA labels where needed) for the input controls, table, and
      drill-down/history navigation.

## Optional / nice-to-have features

Ideas beyond the core goals and must-haves above, not committed to - lower
priority, for later review and pick-and-choose, may not be implemented.

### Input

- [ ] **Multiple package managers** - parse `pnpm-lock.yaml` / `yarn.lock` /
      `package-lock.json` when present, to show actually-resolved versions
      instead of semver ranges.
- [ ] **Monorepo / workspaces support** - detect `workspaces` and let the user
      pick which workspace's `package.json` to summarize, or merge them.
- [ ] **Drag-and-drop file upload**, in addition to the file picker.
- [x] **Paste a GitHub/GitLab/Codeberg repo URL directly** (not just a raw git
      URL), and have the app locate `package.json` in the default branch.

### Table / data

- [ ] **Health/risk score** per package, combining staleness, open issue ratio,
      maintainer count, etc. into a single glanceable indicator.
- [x] **License column**, with a warning badge for copyleft or missing licenses.
- [x] **Outdated version indicator** - compare the installed/semver-range
      version against the latest published version.
- [x] **Security advisories** - surface known vulnerabilities (e.g. via the
      npm/OSV advisory databases) per package.
- [x] **Bundle size** (min+gzip) per package, e.g. via Bundlephobia-style data.
- [x] **Maintainer/publisher info** - who currently owns/publishes the package
      on npm.
- [x] **Deprecation warnings** - flag packages marked deprecated on npm.

### UX

- [ ] **Dark mode.**
- [ ] **Shareable table state** - encode the loaded source + drill-down history
      in the URL so a table view can be linked/bookmarked.
- [ ] **Export** the table as CSV/JSON/Markdown.
- [ ] **Diff view** - compare two `package.json` files (e.g. before/after an
      upgrade) side by side.
- [ ] **Caching** of fetched registry/repo metadata (with visible "last checked"
      timestamps and a manual refresh) to avoid re-hitting rate limits.
      (Metadata is cached in memory to avoid duplicate requests, but there's no
      visible "last checked" timestamp, manual refresh, or persistence across
      reloads yet.)
- [ ] **Offline-tolerant mode** - show whatever data is cached/known even if
      live lookups fail, clearly marked as stale.

## Status

Input methods, the full dependency table, sorting, search, column
visibility, drill-down with history navigation, and in-memory metadata
caching are implemented and tested (unit, component, and e2e). Transitive
dependency resolution, responsive/accessible UI, and most of the
nice-to-have list remain outstanding - see the unchecked boxes above.
