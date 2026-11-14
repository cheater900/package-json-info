# Development

## Code layout


| Path                          | Purpose                                                                                                  |
| ----------------------------- | -------------------------------------------------------------------------------------------------------- |
| `src/main.js`                 | App entry point. Decrypts GitHub token, then mounts `App.vue`.                                           |
| `src/App.vue`, `src/App.ts`   | Root component: input controls, tables, history controls, shared modal.                                  |
| `src/constants.ts`            | API base URLs, supported repo hosts, storage keys, display constants.                                    |
| `src/config.ts`               | Developer settings read from `.env` (see Configuration below).                                           |
| `src/settings.ts`             | User settings store (Zod-validated, in `localStorage`), in-memory token.                                 |
| `src/types.ts`                | Shared domain types: package input, info, error, row, source tree ref.                                   |
| `src/i18n/`                   | `t()` message lookup. UI text lives in `locales/en.json`.                                                |
| `src/api/`                    | Network code: npm registry, repo hosts, OSV, Bundlephobia, source trees.                                 |
| `src/composables/`            | Vue state: column preferences, package.json history, input sources.                                      |
| `src/components/`             | Vue components. Each has own `.vue`, `.ts` and `.css` file.                                              |
| `src/utils/`                  | Helpers: formatting, columns, semver, tar, storage, IndexedDB, URLs.                                     |
| `src/utils/export/`           | Table export: row-to-text builder, format registry, download helper.                                     |
| `src/utils/export/exporters/` | One file per export format: CSV, XLSX, Markdown, HTML, PDF.                                              |
| `public/`                     | Static assets served as-is.                                                                              |
| `tests/unit/`                 | Vitest unit tests, mirroring `src/api`, `src/utils`, `src/composables`.                                  |
| `tests/integration/`          | Vitest component tests mounted with `@vue/test-utils`.                                                   |
| `tests/e2e/`                  | Playwright end-to-end tests. `visual/` holds screenshot run.                                             |
| `tests/helpers/`              | Helpers: fetch stubs, columns, IndexedDB, settings, share links, request recorder.                       |
| `tests/fixtures/`             | Shared test data: dependency rows, registry docs, tarballs, GitHub token, export doc, network log entry. |
| `docs/`                       | Project docs: intent, features, roadmap, notes, known issues, changelog.                                 |


## Stack

- Vue 3 with single-file components
- Vite for dev server and build
- Zod for package.json validation
- Built-in `t()` helper with JSON message catalogs for UI text
- vue-json-pretty for raw JSON viewer, vuedraggable for column reordering
- write-excel-file for XLSX export, jsPDF with jspdf-autotable for PDF export
- Vitest with jsdom for unit and component tests; fake-indexeddb stands in
  for IndexedDB, which jsdom lacks
- Playwright for end-to-end tests
- TypeScript, checked by vue-tsc (strict mode); Vite only strips types
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
settings. App stores them in `localStorage`. `src/settings.ts` also stores
there: CORS proxy, fetch timeout, concurrency, theme, font size and padding.
`.env` values only seed defaults for timeout and concurrency.

`src/utils/githubTokenStorage.ts` keeps GitHub token AES-GCM encrypted: IV
and ciphertext in `localStorage`, non-extractable key in IndexedDB database
`package-json-info`. `main.js` decrypts token into memory before mounting
app. Wait is at most `TOKEN_LOAD_TIMEOUT_MS`, since IndexedDB can hang.
Late token refetches tables.

`src/utils/lookupStore.ts` keeps last good answer of each metadata lookup
in second IndexedDB database, `package-json-info:lookups`.
`src/api/npmPackage.ts` reads it only after live lookup fails. Token purge
clears it.

`main.js` also mirrors display settings onto `<html>`. It resolves theme to
`data-color-scheme` (`light` or `dark`; System follows OS
`prefers-color-scheme`), which picks color variables in `style.css`.
`--font-scale` / `--space-scale` multiply font sizes and paddings.

## Export

`buildExportDocument` turns rows and column keys into `ExportDocument`:
title and sections of translated headers and cell strings. Each file in
`src/utils/export/exporters/` reads only that model, never rows, i18n or
Vue. Each returns `Blob` or promise of one. `EXPORTERS` in
`src/utils/export/index.ts` lists formats in select order, adds their
labels. `ExportDialog` offers one option per entry. Add format with one
exporter file and one registry line.

`ExportDialog` gets rows from `fetchRowsWithColumns` in
`usePackageJsonHistory`. It returns current entry's cached rows when they
cover picked columns, else fetches them; memoized lookups send only
missing services to network. `fetchRowsWithColumns` never writes `deps`,
`devDeps` or entry cache, so tables stay unchanged.

## Translations

All user-facing text lives in `src/i18n/locales/en.json`. Look up message
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
them.

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

Type-check sources, tests and config files:

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
