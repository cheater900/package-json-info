# Changelog

Condensed from git history. Newest month first.

## 2026-11

### Features

#### Network

- **Network log**: **View network logs** in settings menu opens modal
  listing every request, newest first. Columns: state icon, time, method,
  URL, **package** (loaded package.json request served),
  **dependencies**, columns, status, size. Summary counts failed, pending
  and successful requests. **Retry** button on failed row refetches
  matching failed table rows, or resends request. Body breaking off
  mid-download marks request failed. Log stays in memory, capped at 1000
  requests. Replays never keep GitHub token. **Size** counts only body
  bytes app reads, so download size limits still stop transfer. Long
  **URL** (after 80 characters), package, dependency and column text clips
  with ellipsis. Click expands and collapses it, as in dependency tables.

#### Export

- **Table export** as **CSV**, **XLSX**, **Markdown**, **HTML** and
  **PDF**: **Export** button opens **export form** to pick tables, columns
  and format. Export takes every row of each picked table; search filter
  does not apply. Picking column tables never loaded fetches it with
  spinner, holding Download until it arrives, without touching tables.
  XLSX uses `write-excel-file`, PDF uses `jspdf` with `jspdf-autotable`.
  Untrusted cell text escaped per format: CSV formula prefix, Markdown
  backslash escapes, HTML entities plus CSP meta tag. Export disabled
  while shown column loads, Download while export runs. Download URL
  lives 40 s.

#### Package data

- **Failed lookups** show `?` with error as tooltip; `-` now means only
  "no data". **Retry failed fetches** button below each table refetches
  rows that failed, are stale or have failed lookup.
- **Health score** column, 0 to 100 with good, fair or poor band. Inputs:
  release age, deprecation, outdated version, maintainer count, open issue
  ratio, vulnerabilities. Uses only data row already has; tooltip lists
  signals used.
- **Offline fallback**: failed live lookup -> row shows last value stored
  in IndexedDB, with **stale badge** and its date. Stale row refetches on
  history revisit.

#### Drill-down and history

- **Share links**: address bar carries loaded URL, drill-down and
  workspace chain as `?step=` params. Page replays them on open.

#### Input and loading

- **GitHub `/blob/` and `/tree/` URLs** load file or folder
  `package.json` at that ref, not repo root.
- **Responsive layout** down to 360 px: only table scrolls sideways, with
  pinned first column. Inputs, modals, source tree and settings menu fit
  phone width.
- **Monorepo workspaces** for GitHub repo URLs: **Workspace select** lists
  folders matched from `workspaces` or `pnpm-workspace.yaml`, loads picked
  workspace's `package.json`. Matching work and list length capped, so
  crafted repo cannot stall tab.

#### Settings and token

- **Themes** Green, Light and System, plus **font and padding scales** in
  settings menu.
- **GitHub token** stored AES-GCM encrypted under non-extractable
  IndexedDB key, with **rate limit check**. Build-time
  `VITE_GITHUB_TOKEN` gone, so bundle never carries token.
- **Settings menu** behind gear icon: GitHub token, fetch timeout,
  concurrency, CORS proxy. Persisted settings store keeps them.

### Changes

#### Icons

- **Column icons** (Lucide, ISC) in table headers, column picker, export
  form and summary card. Each column gets own icon; date columns share
  calendar base. Shrunk headers show icon plus abbreviation.
- **Source Code link** cell shows external-link icon, not "link" text.
  **Load** action uses down arrow, same as Fetch; magnifier moves into
  **search box**.
- Icons on **accordions** (Columns, Deps, Dev Deps, package.json),
  **settings** sections and buttons, **source tree** folders and files,
  error banner, workspace picker and export Download button.

#### Modals

- Every **modal** has centered **title** on top, close button on right.
  Titles: package name for View, "Source of" package for its tree, "Deps
  of" or "Dev Deps of" package for expanded table, plus Export and Network
  logs. Dialogs drop own headings.

#### Package data

- **Actions column** after Name: View, Load and Reload buttons per row,
  drawn as SVG icon components. Column drag handle is SVG grip, centered
  on column name. Clicking row or Name cell no longer opens or loads
  anything.
- **Section headers** of Deps, Dev Deps and package.json get border and
  soft green hover.
- **Expand table** and **Retry failed fetches** buttons sit right-aligned
  below each table.
- **Column toggles** keep table on screen. Hiding column fetches nothing.
  Newly shown column shows **loading icon** in its cells until data
  arrives. Hiding column during full table load, e.g. revisit retrying
  failed rows, no longer stops load. Hiding column during **Retry failed
  fetches** no longer drops retried rows.

#### Input and loading

- **Layout tweaks**: one-sentence app description above URL input.
  Terminal titlebar sits flush with page top and sides. Main title gets
  bigger top and bottom margin. Columns accordion starts open. Bold
  package name heading -> plain "Showing dependencies for `name`:" line,
  name in `<pre>`. Shrink columns checkbox moves inside Columns
  accordion, below column list. Search box widens 260 px -> 480 px and
  grows taller. Settings panel spaces out sections (34 px) and items
  (24 px), View network logs button spans
  full width with centered text. Network log Actions column centered.
- **Column abbreviations** set per column, standard short forms where
  one exists: VER, OOD, HS, WDL, SRC, TREE, STAR, OPR, CPR, OIS, CIS, DEPS,
  LIC, DEPR, VULN, GZIP, MAINT. Other labels keep initials fallback.
- **package.json accordion** reads "package.json of `name`", plain
  "package.json" for package without name. `<pre>` text uses own
  monospace font, distinct from Courier New body text.
- **Search without match** shows full-width "No dependencies matched
  search" row. Table empty before search keeps "No dependencies".
- **SVG icons** replace text glyphs: Fetch, Paste from clipboard, Expand
  table, Back, Forward, modal close, sort arrows, file tree folders and
  license warning in table cells. Exports keep `⚠` text.
- **Export button** per table, right of Expand table. Dialog opens with
  only that table checked; other table stays checkable.
- **Page width** follows screen with 10% margin each side, full width at
  1024 px and below. Expanded table and source tree modals grow with it.

#### Source tree

- **Source tree** lists max 20,000 entries; **file viewer** shows files up
  to 2 MB. Truncated notice now covers npm tarballs too.
- **Tarball download** streams into gunzip, so oversized or endless body
  cannot exhaust memory.

#### Settings and token

- **Settings menu** width doubled -> 720 px, capped at screen width.
  Section order: Display, Network, GitHub token, with wider gaps.
- **Theme** resolves to `data-color-scheme` in `main.js`; `light-dark()`
  dropped so themes render on browsers without it.
- **Settings dropdown** opens with Vue state and absolute CSS, not Popover
  API, so older Safari and Firefox can close it.
- App mounts after 2 s even when IndexedDB **token load** hangs. Late
  token applies through refetch.

### Fixes

#### Package data

- **Table header icons**: column icon, column name and drag handle share
  one vertical center.
- **Stored lookups** with wrong shape or malformed save time ignored, so
  corrupt record shows live error, not odd cell text.
- **npm registry documents** validated with zod: field of wrong type reads
  as missing, not failing whole row.
- **OSV paging** capped, stops on any repeated page token.
- **Repo slug** parsed from URL path only, so query or hash cannot swap
  repo.

#### Source tree

- **PAX global header** `g` skipped, no longer drops pending long path.
  Tar typeflag `X` named Solaris extended header.
- **Tarball response** without body reports corrupt tarball, not raw
  `TypeError`.
- **File tree paths** deeper than `MAX_FILE_TREE_DEPTH` get translated
  error, so crafted tarball cannot overflow call stack.

#### Input and loading

- **URL input sync** passes absolute URL to `history.replaceState`, so it
  works when app is served under path starting with `//`.

#### Drill-down and history

- Toggling **columns** back mid-fetch keeps cached rows. Abandoned fetch
  stops, no longer overwrites them.
- **In-flight entry fetches** discarded on token or proxy change, so back
  navigation cannot restore stale rows.
- Fetch start clears **previous entry's rows**, so empty list does not
  show stale dependencies.

#### Settings and token

- **Token** set while GitHub lookups run, e.g. loaded after 2 s mount
  timeout, now applies to them. Refetch no longer reuses anonymous,
  rate-limited requests.
- **Token save** waits for IndexedDB commit. Failed save purges
  half-written key and ciphertext.
- **Stored token** survives IndexedDB failure on load; only corrupt data
  or lost key purges it.
- **Verify result** dropped when token changed meanwhile, so purged token
  never shows stale quota.
- **Config integers** above 2^31-1 rejected, so huge timeout cannot
  overflow timer and abort every fetch.

### Security

#### Network

- **`Authorization` requests** go only to `api.github.com`.
  `fetchWithTimeout` refuses any other origin, so GitHub token cannot
  reach another host.
- **CORS proxy URL** with `user:password` rejected, so credentials never
  stored or echoed in fetch errors.

#### Source tree

- **PAX `=` search** bound to its record; **tree paths** normalized by
  split. Stops quadratic parsing and slash-run ReDoS.

#### Package data

- **Semver regex** anchored at digit-run start to stop quadratic scan.

#### Drill-down and history

- **Share link replay** stops **table fetch** of each entry it passes, so
  long link cannot multiply requests or burn GitHub quota.

#### Settings and token

- **Token purge** also clears **cached and stored lookups**, so private
  repo data does not outlive token. In-memory token goes first. Lookup
  still in flight at purge saves nothing.

#### Tooling

- **`.env` files** ignored by git.

### Refactors

#### Code structure

- **`.inline-pre`** lives in global `style.css` beside `code`. App
  integration and e2e tests share `shownPackageName` helper instead of
  repeating "Showing dependencies for" sentence.
- **`TextWrapped`** component holds click-to-expand for long text:
  ellipsis, zoom-in cursor when clipped, zoom-out when expanded.
  `maxLength` prop sets clip width in characters. Dependency tables and
  network log both use it.
- **Network log helpers** shared with existing code: `lookupKey` keys
  request subjects and offline store. `bearerAuthorization` and
  `HTTP_HEADER_AUTHORIZATION` build GitHub headers and replays.
  `formatKilobytes` formats bundle and log sizes.
  `--modal-content-padding` pads every modal. Network log tests share
  `networkLogEntry` fixture.
- **`memoizeLookup`** and its `Lookup` helpers -> `utils/memoizeLookup.ts`.
  Each lookup passes its stored-value schema, so result needs no cast.
  `loadFromSource` takes options object, **`--warning`** color joins
  `style.css`, share link and history tests share helpers.
- **`var()` fallback colors** removed from component CSS; `style.css`
  defines every variable for both themes.
- **Inline SVG icons** -> `IconUpload.vue` and `IconGear.vue`.
- **npm license schema** -> `utils/license.ts`; `NpmLicenseField` inferred
  from it.
- **Named constants** replace literals: Playwright dev server settings,
  `GITHUB_HOST` in `github:` shorthand URL, OSV page cap, config integer
  limit, shared-prefix names for storage keys and tar bytes.
- **Shared helpers**: `settle` for package fetches, IndexedDB promisify
  helpers, percent formatter, `isConfigInt`, `isRepoHostUrl` in repo URL
  utils.
- **`SourceTreeRef`** and **`DependencyRow`** -> `types.ts`, so domain
  types do not import from api layer.
- **`main.js` startup steps** are named functions; modal content has
  `ModalContent` type.

### Tests

#### Coverage

- Tests for **network log subjects**: each lookup kind tags its requests
  with row name and columns. Source tree download and its lazy file fetch
  do too. `clearPackageInfoCache` starts fresh subjects. Failed replay
  logs new failure entry. Open **network log modal** shows its headers and
  adds packages joining shared lookup. Its **retry button** on real failed
  request refetches table row, in App and in e2e.
- Tests for **offline store**: stored issue counts and release tag,
  hanging IndexedDB on read and save. E2e reload during registry outage
  shows **stale badge** and health score. Saved column preferences keep
  **health column** hidden and last.
- Tests for **tar edge cases**, **source tree viewer**, URL sync under
  `//` path, tooltip, file tree item, truncated table cells. Tests only
  restating constant removed.
- **History tests** stop their watchers after each test.

#### Tooling

- **Shared test helpers**: IndexedDB stub, settings reset, token and rate
  limit fixtures, `stubFetchByUrl`, `fetchCallsTo`, minimal registry
  document.
- **Vitest config** restores spies and stubbed globals; e2e mock routes
  built from API constants.

### Build and tooling

#### Tooling

- **Commit bodies** dropped from `main` history with `git filter-repo`.
  Each commit keeps only subject, so this changelog holds detail.
- **`npm run typecheck`** runs vue-tsc in strict mode over sources, tests
  and config files, with new `tsconfig.json`.
- `en.json` imported with type attribute so Playwright can load specs
  pulling in i18n.

### Docs and licensing

#### Docs

- Docs follow standard layout: **`KNOWN_ISSUES.md`** split from
  `NOTES.md`, changelog grouped by month, scope and area.
- Planned work moved out of `FEATURES.md` -> **`ROADMAP.md`** and
  **`IDEA.md`**. Open audit gaps recorded in `NOTES.md`.
- `DEVELOPMENT.md` documents test helper layout, shared types and docs
  folder.

## 2026-10

### Features

#### Package data

- **OSV result pages** followed for full vulnerability count.
- **npm alias specs** resolve to real registry package.

#### Source tree

- **GNU long-name tar entries** read for paths over 100 characters.
- **Notice** shows when GitHub lists source tree only in part.

#### Network

- **Network requests** abort after configurable timeout. Numeric env
  settings validated at startup.

### Changes

#### Package data

- **Version data and date** resolve from leading semver of range.
- **GitHub release tag** lookup uses pinned version and exact ref, not
  raw range or prefix match.
- Failed optional lookup falls back **per field**. Rate limits and
  outages no longer cached as missing data.

#### Input and loading

- **Repo URLs** accept `.git` suffix, query and any host case.
- **URL input** rejects blank value and value without http(s) scheme.
- **Address bar sync** of URL input debounced.

#### UI and theme

- **CSS classes** renamed to BEM `block__element--modifier` form.

### Fixes

#### Package data

- **Failed package rows** show their error and get refetched.
- **Async memo cache** evicts only its own failed request.

#### Source tree

- Truncated or corrupt **tarball** fails instead of showing partial tree.
  Undecodable one reports as corrupt, not blank error.
- **PAX tar records** parsed as bytes, so non-ASCII paths work.
- **Submodule entries** left out of GitHub source tree.
- **Stale results** ignored in source tree browser; same file selectable
  again.
- **Duplicate tree nodes** and invalid dates fixed.

#### Drill-down and history

- Only latest **`package.json` load** applies. Dependency fetch applies
  only to entry that started it.
- **Stale error banner** cleared.

### Security

#### Source tree

- **Unpacked tarball size** capped to stop gzip bombs.
- **npm tarball** fetched only from http(s) URLs.

#### Package data

- **Repo host** matches only as whole hostname. Owner and repo limited to
  host name characters.
- **Source links** from npm data shown only for http(s) URLs.

#### Tooling

- vue, oxfmt and transitive dependencies bumped past known advisories.

### Refactors

#### Code structure

- **Network code** split into api layer; components and tests
  deduplicated.
- **Loaded `package.json`** validated with zod schema; its types derive
  from that schema.
- **Shared helpers**: `settle` for load-then-check-staleness flows,
  first-found URL probing, `parseRepoSlug` for repo URL input, byte
  concat, `pinnedVersionOf` in semver utils.
- **Code style pass** over `src` and tests: braces on all conditionals,
  early returns, named checks replacing comments, sorted CSS properties.
- **History entry rows** typed as `PackageInfo` or `PackageError`;
  composable parameters typed.

#### i18n

- **User-facing text** moved into i18n message catalog.

### Tests

#### Tooling

- **HTTP status constants** and response builders shared across tests;
  test titles shortened.

### Docs and licensing

#### Docs

- **`INTENT.md`** added: purpose, principles, non-goals.
- Docs reworded; non-ASCII dashes in README -> hyphens.

## 2026-09

### Features

#### Dependencies table

- **Package summary card** opens in modal on row click.
- **Clickable Name cell** replaces Actions column.
- **Long text cells** truncate, click expands; version columns excluded.
- **Fullscreen expand modal** for dependencies table.
- **Drag to reorder** table columns.
- **Shrink columns** preference abbreviates column labels.
- **Column visibility** persists in `localStorage`.
- One shared **search box** replaces per-table search boxes.
- **Loading row** shows while `package.json` swap is in flight.

#### Source tree

- **Source Code Tree column** opens browsable source tree.

#### Input and loading

- **URL input** syncs with `?inputUrl=` query parameter.
- **`package.json` viewer**: raw `<pre>` text -> vue-json-pretty.
- Current **package name** shows above tables.

#### UI and theme

- **Retro terminal theme**, with icons on input buttons and uppercase
  button labels.
- **Tooltip component** replaces native `title` tooltips.

### Changes

#### Dependencies table

- **Numeric columns** use comma-separated thousands; dates drop weekday.
- **Table layout**: every column but Name centered, green grid, status
  row inside table, centered loading and empty messages.
- **Table headers** do not wrap. Sort trigger is plain text, icon on
  right.
- **Columns panel** uses responsive grid.

#### UI and theme

- **Accordions** for Deps, Dev Deps and `package.json` open by default.
- **Toolbar rows** use flex layouts. Search row sits below package name;
  search input wider.
- Expanded table bound to screen size; source tree modal has green
  border.

### Fixes

#### Dependencies table

- Comma-formatted numbers and weekday-free dates, lost in merge, restored.

### Refactors

#### Code structure

- **Vue components** split into separate `.vue`, `.ts` and `.css` files.
- **Composables** and pure row logic extracted from app component.
- **Modal component** reusable, owned by `App`. `DependenciesTable` owns
  its column knowledge.
- `hiddenColumns` -> `visibleColumns`.

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

- **Search box** filters table by package name.
- **Column visibility panel** with floor of two columns. Hidden columns
  make no network requests.
- **Click to sort** on numeric and date columns.
- **Accordions** for Columns, Deps and Dev Deps.

#### Package data

- **Enrichment columns**: closed PR and issue counts, dependency list,
  other nice-to-have data.
- **Star counts** from GitLab and Codeberg next to GitHub.
- **In-memory cache** for package metadata lookups.

#### Drill-down and history

- **Load column** drills into row's own `package.json`.
- **History navigation** with back and forward buttons, shown once more
  than one entry exists.

### Changes

#### Dependencies table

- Columns backed by third-party services hidden by default.

### Fixes

#### Dependencies table

- Invalid table markup fixed.

### Security

#### Tooling

- nanoid and postcss bumped to patched versions.

### Tests

#### Coverage

- **Unit tests** for npm and GitHub metadata fetcher, parsing and caching
  helpers. **Component tests** for `DependenciesTable`.
- **Playwright e2e tests**, including horizontal table scrolling.

#### Tooling

- Tests live in one `tests/` tree. **Screenshot script** captures UI for
  visual review.

### Build and tooling

#### Tooling

- **oxlint** and **oxfmt** added; codebase reformatted.
- **Vitest** and **Playwright** added.

### Docs and licensing

#### Docs

- README documents project goals, must-have and optional features.
