# Development

## Code layout

| Path                                | Purpose                                                                                                  |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `src/core/`                         | Framework-free logic shared by web app and future CLI. No Vue, no DOM, no `src/app` imports.             |
| `src/core/runtime.ts`               | `configureCore()` seam: settings, request subject wrapper, offline lookup store.                         |
| `src/core/api/`                     | Network code: npm registry, repo hosts, OSV, Bundlephobia, source trees, package.json sources.           |
| `src/core/utils/`                   | Data helpers: formatting, columns, health score and filters, semver, license, tar, URLs.                 |
| `src/core/export/`                  | Table export: row-to-text builder, format registry.                                                      |
| `src/core/export/exporters/`        | One file per export format: CSV, XLSX, Markdown, HTML, PDF.                                              |
| `src/core/report/`                  | Dependency report: builder over filter sections, Markdown and PDF renderers.                             |
| `src/core/i18n/`                    | `t()` message lookup. All text lives in `locales/en.json`.                                               |
| `src/core/constants.ts`             | API base URLs, repo hosts, limits, health weights, display constants core uses.                          |
| `src/core/types.ts`                 | Shared domain types: package input, info, error, row, source tree ref.                                   |
| `src/app/`                          | Vue web app.                                                                                             |
| `src/app/main.js`                   | App entry point. Binds core, decrypts GitHub token, then mounts `App.vue`.                               |
| `src/app/coreBinding.ts`            | `bindCore()`: feeds app settings, Vue `reactive` and IndexedDB store to core.                            |
| `src/app/App.vue`, `src/app/App.ts` | Root component: input controls, tables, history controls, shared modal.                                  |
| `src/app/constants.ts`              | Storage keys, IndexedDB names, settings options, share link limits, UI timings.                          |
| `src/app/config.ts`                 | Developer settings read from `.env` (see Configuration below).                                           |
| `src/app/settings.ts`               | User settings store (Zod-validated, in `localStorage`), in-memory token.                                 |
| `src/app/composables/`              | Vue state: column preferences, package.json history, input sources, popovers, export lock.               |
| `src/app/components/`               | Vue components. Each has own `.vue`, `.ts` and `.css` file.                                              |
| `src/app/utils/`                    | Browser helpers: storage, IndexedDB, token storage, network log, share state, download.                  |
| `public/`                           | Static assets served as-is.                                                                              |
| `tests/unit/core/`                  | Vitest unit tests of `src/core`, run in Node.                                                            |
| `tests/unit/app/`                   | Vitest unit tests of `src/app`, run in jsdom.                                                            |
| `tests/integration/`                | Vitest component tests mounted with `@vue/test-utils`, run in jsdom.                                     |
| `tests/e2e/`                        | Playwright end-to-end tests. `visual/` holds screenshot run.                                             |
| `tests/helpers/`                    | Fetch, requests, columns, IndexedDB, lookup store, settings, core, share links, PDF, download, wrapper.  |
| `tests/fixtures/`                   | Shared test data: dependency rows, registry docs, tarballs, GitHub token, export doc, network log entry. |
| `docs/`                             | Project docs: intent, features, roadmap, notes, known issues, changelog.                                 |

## Core and app

`src/core` holds every step that fetches or shapes data. `src/app` holds
Vue state, rendering and browser storage, and calls core. A CLI in
`src/cli` can later reuse core unchanged.

Core reads host state only through `coreRuntime()` from
`src/core/runtime.ts`. Host calls `configureCore()` once to plug in:

- `settings`: getter for proxy URL, fetch timeout, concurrency and GitHub
  token. Core calls it on each request, so changed settings apply at once.
- `trackSubject`: wraps each request subject before core mutates it. App
  passes Vue `reactive`, so network log sees subjects grow.
- `lookupStore`: offline copy of last good lookups. App passes IndexedDB
  store; without one, failed lookups throw. Rejecting `load` counts as
  nothing stored, rejecting `save` loses only offline copy.

Core uses settings as given. Host validates them first: app does so in
`src/app/settings.ts`. Core API still checks its own inputs, so
`fetchUrlSource` rejects any URL that is not absolute http(s).

`src/app/coreBinding.ts` plugs these in for web app. Three checks keep core
clean:

- `src/core/tsconfig.json` type-checks core without DOM types.
- oxlint rejects `vue` and `src/app` imports under `src/core`.
- Vitest runs core tests in Node environment.

## Stack

- Vue 3 with single-file components
- Vite for dev server and build
- Zod for package.json validation
- Built-in `t()` helper with JSON message catalogs for UI text
- vue-json-pretty for raw JSON viewer, vuedraggable for column reordering
- write-excel-file for XLSX export, jsPDF with jspdf-autotable for PDF export
- Vitest in two projects: `core` in Node, `app` with jsdom for unit and
  component tests; fake-indexeddb stands in for IndexedDB, which neither
  has
- Playwright for end-to-end tests
- TypeScript, checked by vue-tsc (strict mode) and `tsc -p src/core`; Vite
  only strips types
- oxlint and oxfmt for linting and formatting

## Configuration

Copy `.env.example` to `.env.local`, fill in needed values. Vite inlines
every `VITE_*` variable into client bundle. GitHub token is not build
setting: each user enters own token in settings menu, so public build
carries no token.

- `VITE_FETCH_CONCURRENCY`: default number of packages fetched in parallel
  per table. Default 5.
- `VITE_FETCH_TIMEOUT_MS`: default milliseconds before network request
  aborts. Default 30000.

Numeric settings must be positive integers up to 2147483647, largest delay
browser timers support. Other values log warning in browser console and
fall back to default.

Column visibility, column order and "shrink columns" toggle are user
settings. App stores them in `localStorage`. `src/app/settings.ts` also stores
there: CORS proxy, fetch timeout, concurrency, theme, font size and padding.
`.env` values only seed defaults for timeout and concurrency.

`src/app/utils/githubTokenStorage.ts` keeps GitHub token AES-GCM encrypted: IV
and ciphertext in `localStorage`, non-extractable key in IndexedDB database
`package-json-info`. `main.js` decrypts token into memory before mounting
app. Wait is at most `TOKEN_LOAD_TIMEOUT_MS`, since IndexedDB can hang.
Late token refetches tables.

`src/app/utils/lookupStore.ts` keeps last good answer of each metadata lookup
in second IndexedDB database, `package-json-info:lookups`.
`src/core/api/npmPackage.ts` reads it only after live lookup fails. Token purge
clears it.

`main.js` also mirrors display settings onto `<html>`. It resolves theme to
`data-color-scheme` (`light` or `dark`; System follows OS
`prefers-color-scheme`), which picks color variables in `style.css`.
`--font-scale` / `--space-scale` multiply font sizes and paddings.

## Export

`buildExportDocument` turns rows and column keys into `ExportDocument`:
title and sections of translated headers and cell strings. Each file in
`src/core/export/exporters/` reads only that model, never rows, i18n or
Vue. Each returns `Blob` or promise of one. `EXPORTERS` in
`src/core/export/index.ts` lists formats in select order, adds their
labels. `ExportDialog` offers one option per entry. Add format with one
exporter file and one registry line.

`ExportDialog` gets rows from `fetchRowsWithColumns` in
`usePackageJsonHistory`. It returns current entry's cached rows when they
cover picked columns, else fetches them; memoized lookups send only
missing services to network. `fetchRowsWithColumns` never writes `deps`,
`devDeps` or entry cache, so tables stay unchanged.

## Report

`buildReport` in `src/core/report/buildReport.ts` turns tables, search
query and health filters into `Report`: title plus heading, paragraph,
list and table blocks of plain strings. It applies `filterRowsByName` and
`filterRowsByHealth` itself and walks `HEALTH_FILTER_SECTIONS`, so new
filter section shows up in report with one `report.definitions.<id>`
message. Definitions take numbers from `constants.ts` as message params.
`renderReportMarkdown` returns string, `renderReportPdf` returns `Blob`;
both read only `Report`. App fetches `REPORT_COLUMN_KEYS` through
`fetchRowsWithColumns`, then `ReportDialog` renders blocks and saves files.
Test in `tests/unit/core/report/buildReport.test.ts` rejects advice words
in report messages and output.

## Translations

All user-facing text lives in `src/core/i18n/locales/en.json`. Look up message
with `t("group.key")`. Second argument fills placeholders such as `{name}`:
`t("errors.dependencyNotFound", { name })`. Components return `t` from
`setup()` so templates can call it. Unit test fails when code uses literal
key missing from catalog.

## Run

Install dependencies:

```sh
npm install
```

Start dev server:

```sh
npm run dev
```

Preview production build:

```sh
npm run preview
```

## Build

Build into `dist/`:

```sh
npm run build
```

## Test

Vitest restores spies and stubbed globals after each test (`restoreMocks`,
`unstubGlobals` in `vite.config.js`). Test files need no cleanup hooks for
them. `core` project resets core runtime before each test; core tests set
settings through `coreSettings` from `tests/helpers/core.ts`. `app` project
binds core to app settings once per file.

Run unit and component tests:

```sh
npm test
```

Run unit and component tests in watch mode:

```sh
npm run test:watch
```

Run end-to-end tests (needs `npx playwright install chromium` once):

```sh
npm run test:e2e
```

Capture UI screenshots into `screenshots/`:

```sh
npm run screenshots
```

## Lint and format

Type-check sources, tests and config files, then `src/core` alone without
DOM types:

```sh
npm run typecheck
```

Lint:

```sh
npm run lint
```

Format all files:

```sh
npm run format
```

Check formatting without writing:

```sh
npm run format:check
```
