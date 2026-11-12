# Changelog

Condensed from git history. Newest month first.

## 2026-11

### Features

#### Export

- **Table export** as **CSV**, **XLSX**, **Markdown**, **HTML** and
  **PDF**: an **Export** button opens an **export form** to pick tables,
  columns and format. Every row of each picked table is exported; the
  search filter does not apply. Picking a column the tables never loaded
  fetches it with a spinner and holds Download until it arrives, without
  touching the tables. XLSX uses `write-excel-file`, PDF uses `jspdf` with
  `jspdf-autotable`. Untrusted cell text is escaped per format: CSV
  formula prefix, Markdown backslash escapes, HTML entities plus a CSP
  meta tag. Export stays disabled while a shown column loads, Download
  while an export runs; the download URL lives 40 s.

#### Package data

- **Failed lookups** show `?` with the error as tooltip; `-` now means
  only "no data". A **Retry failed fetches** button below each table
  refetches its rows that failed, are stale or have a failed lookup.
- **Health score** column, 0 to 100 with a good, fair or poor band, from
  release age, deprecation, outdated version, maintainer count, open issue
  ratio and vulnerabilities. It uses only data the row already has; a
  tooltip lists the signals used.
- **Offline fallback**: when a live lookup fails, the row shows the last
  value stored in IndexedDB, with a **stale badge** and its date. A stale
  row refetches on history revisit.

#### Drill-down and history

- **Share links**: the address bar carries the loaded URL, drill-down and
  workspace chain as `?step=` params, and the page replays them on open.

#### Input and loading

- **GitHub `/blob/` and `/tree/` URLs** load the file or folder
  `package.json` at that ref instead of the repo root.
- **Responsive layout** down to 360 px: only the table scrolls sideways,
  with a pinned first column; inputs, modals, source tree and settings
  menu fit phone width.
- **Monorepo workspaces** for GitHub repo URLs: a **Workspace select**
  lists folders matched from `workspaces` or `pnpm-workspace.yaml`, and
  loads the picked workspace's `package.json`. Matching work and list
  length are capped, so a crafted repo cannot stall the tab.

#### Settings and token

- **Themes** Green, Light and System, plus **font and padding scales** in
  the settings menu.
- **GitHub token** stored AES-GCM encrypted under a non-extractable
  IndexedDB key, with a **rate limit check**. Build-time
  `VITE_GITHUB_TOKEN` is gone, so the bundle never carries a token.
- **Settings menu** behind a gear icon: GitHub token, fetch timeout,
  concurrency and CORS proxy, kept in a persisted settings store.

### Changes

#### Package data

- **Column toggles** keep the table on screen. Hiding a column fetches
  nothing; a newly shown column shows a **loading icon** in its cells until
  its data arrives. Hiding a column during a full table load, such as a
  revisit retrying failed rows, no longer stops that load. Hiding a
  column during **Retry failed fetches** no longer drops the retried rows.

#### Input and loading

- **Page width** follows the screen with a 10% margin each side, full
  width at 1024 px and below. The expanded table and source tree modals
  grow with it.

#### Source tree

- **Source tree** lists at most 20,000 entries and the **file viewer**
  shows files up to 2 MB. The truncated notice now covers npm tarballs too.
- **Tarball download** streams into gunzip, so an oversized or endless body
  cannot exhaust memory.

#### Settings and token

- **Settings menu** twice as wide, 720 px, capped at screen width.
  Sections run Display, Network, GitHub token, with wider gaps between.
- **Theme** resolves to `data-color-scheme` in `main.js`; `light-dark()` is
  dropped so themes render on browsers without it.
- **Settings dropdown** opens with Vue state and absolute CSS instead of the
  Popover API, so older Safari and Firefox can close it.
- App mounts after 2 s even when the IndexedDB **token load** hangs; a late
  token applies through a refetch.

### Fixes

#### Package data

- **Stored lookups** of the wrong shape or with a malformed save time are
  ignored, so a corrupt record shows the live error, not odd cell text.
- **npm registry documents** are validated with zod: a field of the wrong
  type reads as missing instead of failing the whole row.
- **OSV paging** is capped and stops on any repeated page token.
- **Repo slug** is parsed from the URL path only, so query or hash cannot
  swap the repo.

#### Source tree

- **PAX global header** `g` is skipped and no longer drops a pending long
  path; tar typeflag `X` is named Solaris extended header.
- **Tarball response** without a body reports a corrupt tarball instead of
  a raw `TypeError`.
- **File tree paths** deeper than `MAX_FILE_TREE_DEPTH` get a translated
  error, so a crafted tarball cannot overflow the call stack.

#### Input and loading

- **URL input sync** passes an absolute URL to `history.replaceState`, so
  it works when the app is served under a path starting with `//`.

#### Drill-down and history

- Toggling **columns** back mid-fetch keeps the cached rows; the abandoned
  fetch stops and no longer overwrites them.
- **In-flight entry fetches** are discarded on token or proxy change, so
  back navigation cannot restore stale rows.
- A fetch start clears the **previous entry's rows**, so an empty list
  does not show stale dependencies.

#### Settings and token

- **Token** set while GitHub lookups run, e.g. loaded after the 2 s mount
  timeout, now applies to them: the refetch no longer reuses the
  anonymous, rate-limited requests.
- **Token save** waits for the IndexedDB commit, and a failed save purges
  the half-written key and ciphertext.
- **Stored token** survives an IndexedDB failure on load; only corrupt data
  or a lost key purges it.
- **Verify result** is dropped when the token changed meanwhile, so a
  purged token never shows a stale quota.
- **Config integers** above 2^31-1 are rejected, so a huge timeout cannot
  overflow the timer and abort every fetch.

### Security

#### Network

- **`Authorization` requests** go only to `api.github.com`;
  `fetchWithTimeout` refuses any other origin, so the GitHub token cannot
  reach another host.
- **CORS proxy URL** with `user:password` is rejected, so credentials are
  never stored or echoed in fetch errors.

#### Source tree

- **PAX `=` search** is bound to its record and **tree paths** are
  normalized by split, which stops quadratic parsing and a slash-run ReDoS.

#### Package data

- **Semver regex** is anchored at the digit-run start to stop a quadratic
  scan.

#### Drill-down and history

- **Share link replay** stops the **table fetch** of each entry it passes,
  so a long link cannot multiply requests or burn the GitHub quota.

#### Settings and token

- **Token purge** also clears **cached and stored lookups**, so private
  repo data does not outlive the token. The in-memory token goes first,
  and a lookup still in flight at purge saves nothing.

#### Tooling

- **`.env` files** are ignored by git.

### Refactors

#### Code structure

- **`memoizeLookup`** and its `Lookup` helpers moved to
  `utils/memoizeLookup.ts`; each lookup passes its stored-value schema, so
  the result needs no cast. `loadFromSource` takes an options object,
  **`--warning`** color joins `style.css`, and share link and history
  tests share helpers.
- **`var()` fallback colors** removed from component CSS; `style.css`
  defines every variable for both themes.
- **Inline SVG icons** moved into `IconUpload.vue` and `IconGear.vue`.
- **npm license schema** moved to `utils/license.ts`; `NpmLicenseField` is
  inferred from it.
- **Named constants** replace literals: Playwright dev server settings,
  `GITHUB_HOST` in the `github:` shorthand URL, OSV page cap, config
  integer limit, shared-prefix names for storage keys and tar bytes.
- **Shared helpers**: `settle` for package fetches, IndexedDB promisify
  helpers, percent formatter, `isConfigInt`, `isRepoHostUrl` in repo URL
  utils.
- **`SourceTreeRef`** and **`DependencyRow`** moved to `types.ts`, so
  domain types do not import from the api layer.
- **`main.js` startup steps** are named functions; modal content has a
  `ModalContent` type.

### Tests

#### Coverage

- Tests added for the **offline store**: stored issue counts and release
  tag, a hanging IndexedDB on read and save, and an e2e reload during a
  registry outage that shows the **stale badge** and health score. Saved
  column preferences keep the **health column** hidden and last.
- Tests added for **tar edge cases**, the **source tree viewer**, URL sync
  under a `//` path, tooltip, file tree item and truncated table cells.
  Tests that only restated a constant are gone.
- **History tests** stop their watchers after each test.

#### Tooling

- **Shared test helpers**: IndexedDB stub, settings reset, token and rate
  limit fixtures, `stubFetchByUrl`, `fetchCallsTo`, minimal registry
  document.
- **Vitest config** restores spies and stubbed globals; e2e mock routes are
  built from API constants.

### Build and tooling

#### Tooling

- **`npm run typecheck`** runs vue-tsc in strict mode over sources, tests
  and config files, with a new `tsconfig.json`.
- `en.json` is imported with a type attribute so Playwright can load specs
  that pull in i18n.

### Docs and licensing

#### Docs

- Docs follow the standard layout: **`KNOWN_ISSUES.md`** split from
  `NOTES.md`, changelog grouped by month, scope and area.
- Planned work moved out of `FEATURES.md` into **`ROADMAP.md`** and
  **`IDEA.md`**; open audit gaps recorded in `NOTES.md`.
- `DEVELOPMENT.md` documents test helper layout, shared types and the docs
  folder.

## 2026-10

### Features

#### Package data

- **OSV result pages** are followed for the full vulnerability count.
- **npm alias specs** resolve to the real registry package.

#### Source tree

- **GNU long-name tar entries** are read for paths over 100 characters.
- A **notice** shows when GitHub lists the source tree only in part.

#### Network

- **Network requests** abort after a configurable timeout; numeric env
  settings are validated at startup.

### Changes

#### Package data

- **Version data and date** resolve from the leading semver of a range.
- **GitHub release tag** lookup uses the pinned version and an exact ref,
  not the raw range or a prefix match.
- An optional lookup that fails falls back **per field**; rate limits and
  outages are no longer cached as missing data.

#### Input and loading

- **Repo URLs** accept a `.git` suffix, a query and any host case.
- **URL input** rejects a value without an http(s) scheme, and a blank
  value.
- **Address bar sync** of the URL input is debounced.

#### UI and theme

- **CSS classes** renamed to BEM `block__element--modifier` form.

### Fixes

#### Package data

- **Failed package rows** show their error and are refetched.
- **Async memo cache** evicts only its own failed request.

#### Source tree

- A truncated or corrupt **tarball** fails instead of showing a partial
  tree; an undecodable one reports as corrupt instead of a blank error.
- **PAX tar records** are parsed as bytes, so non-ASCII paths work.
- **Submodule entries** are left out of the GitHub source tree.
- **Stale results** are ignored in the source tree browser; the same file
  can be selected again.
- **Duplicate tree nodes** and invalid dates are fixed.

#### Drill-down and history

- Only the most recent **`package.json` load** applies, and a dependency
  fetch applies only to the entry that started it.
- **Stale error banner** is cleared.

### Security

#### Source tree

- **Unpacked tarball size** is capped to stop gzip bombs.
- **npm tarball** is fetched only from http(s) URLs.

#### Package data

- **Repo host** matches only as a whole hostname; owner and repo are
  limited to host name characters.
- **Source links** from npm data are shown only for http(s) URLs.

#### Tooling

- vue, oxfmt and transitive dependencies bumped past known advisories.

### Refactors

#### Code structure

- **Network code** split into an api layer; components and tests
  deduplicated.
- **Loaded `package.json`** is validated with a zod schema, and its types
  derive from that schema.
- **Shared helpers**: `settle` for load-then-check-staleness flows,
  first-found URL probing, `parseRepoSlug` for repo URL input, byte concat,
  `pinnedVersionOf` in semver utils.
- **Code style pass** over `src` and tests: braces on all conditionals,
  early returns, named checks in place of comments, sorted CSS properties.
- **History entry rows** typed as `PackageInfo` or `PackageError`;
  composable parameters typed.

#### i18n

- **User-facing text** moved into an i18n message catalog.

### Tests

#### Tooling

- **HTTP status constants** and response builders shared across tests;
  test titles shortened.

### Docs and licensing

#### Docs

- **`INTENT.md`** added: purpose, principles and non-goals.
- Docs reworded; non-ASCII dashes in README replaced with hyphens.

## 2026-09

### Features

#### Dependencies table

- **Package summary card** opens in the modal when a row is clicked.
- **Clickable Name cell** replaces the Actions column.
- **Long text cells** truncate with click to expand; version columns are
  excluded.
- **Fullscreen expand modal** for the dependencies table.
- **Drag to reorder** table columns.
- **Shrink columns** preference abbreviates column labels.
- **Column visibility** persists in `localStorage`.
- One shared **search box** replaces the search box of each table.
- **Loading row** shows while a `package.json` swap is in flight.

#### Source tree

- **Source Code Tree column** opens a browsable source tree.

#### Input and loading

- **URL input** syncs with the `?inputUrl=` query parameter.
- **`package.json` viewer** uses vue-json-pretty instead of raw `<pre>`
  text.
- Current **package name** shows above the tables.

#### UI and theme

- **Retro terminal theme**, with icons on input buttons and uppercase
  button labels.
- **Tooltip component** replaces native `title` tooltips.

### Changes

#### Dependencies table

- **Numeric columns** use comma-separated thousands; dates drop the
  weekday.
- **Table layout**: every column but Name is centered, a green grid, a
  status row inside the table, centered loading and empty messages.
- **Table headers** do not wrap; the sort trigger is plain text with its
  icon on the right.
- **Columns panel** uses a responsive grid.

#### UI and theme

- **Accordions** for Deps, Dev Deps and `package.json` are open by default.
- **Toolbar rows** use flex layouts; the search row sits below the package
  name and the search input is wider.
- The expanded table is bound to the screen size; the source tree modal
  has a green border.

### Fixes

#### Dependencies table

- Comma-formatted numbers and weekday-free dates, lost in a merge, are
  restored.

### Refactors

#### Code structure

- **Vue components** split into separate `.vue`, `.ts` and `.css` files.
- **Composables** and pure row logic extracted from the app component.
- **Modal component** is reusable and owned by `App`; `DependenciesTable`
  owns its column knowledge.
- `hiddenColumns` replaced with `visibleColumns`.

### Build and tooling

#### Tooling

- Test scripts disable Node's experimental webstorage global.

## 2026-08

### Features

#### Input and loading

- **Four `package.json` input methods** with validation and loading state,
  later merged into one URL row and two action buttons.
- **Git URL input** supports GitLab and Codeberg next to GitHub.

#### Dependencies table

- **Search box** filters the table by package name.
- **Column visibility panel** with a floor of two columns; hidden columns
  make no network requests.
- **Click to sort** on numeric and date columns.
- **Accordions** for Columns, Deps and Dev Deps.

#### Package data

- **Enrichment columns**: closed PR and issue counts, dependency list and
  the other nice-to-have data.
- **Star counts** from GitLab and Codeberg next to GitHub.
- **In-memory cache** for package metadata lookups.

#### Drill-down and history

- **Load column** drills into a row's own `package.json`.
- **History navigation** with back and forward buttons, shown once there
  is more than one entry.

### Changes

#### Dependencies table

- Columns backed by third-party services are hidden by default.

### Fixes

#### Dependencies table

- Invalid table markup fixed.

### Security

#### Tooling

- nanoid and postcss bumped to patched versions.

### Tests

#### Coverage

- **Unit tests** for the npm and GitHub metadata fetcher and for parsing
  and caching helpers; **component tests** for `DependenciesTable`.
- **Playwright e2e tests**, including horizontal table scrolling.

#### Tooling

- Tests live in one `tests/` tree; a **screenshot script** captures the UI
  for visual review.

### Build and tooling

#### Tooling

- **oxlint** and **oxfmt** added; codebase reformatted.
- **Vitest** and **Playwright** added.

### Docs and licensing

#### Docs

- README documents project goals, must-have and optional features.
