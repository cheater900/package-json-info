# Development

## Code layout

| Path                        | Purpose                                                                  |
| --------------------------- | ------------------------------------------------------------------------ |
| `src/main.js`               | App entry point. Decrypts the GitHub token, then mounts `App.vue`.       |
| `src/App.vue`, `src/App.ts` | Root component: input controls, tables, history controls, shared modal.  |
| `src/constants.ts`          | API base URLs, supported repo hosts, storage keys, display constants.    |
| `src/config.ts`             | Developer settings read from `.env` (see Configuration below).           |
| `src/settings.ts`           | User settings store (Zod-validated, in `localStorage`), in-memory token. |
| `src/types.ts`              | Shared `PackageInfo` / `PackageInput` / `PackageError` types.            |
| `src/i18n/`                 | `t()` message lookup. UI text lives in `locales/en.json`.                |
| `src/api/`                  | Network code: npm registry, repo hosts, OSV, Bundlephobia, source trees. |
| `src/composables/`          | Vue state: column preferences, package.json history, input sources.      |
| `src/components/`           | Vue components. Each has its own `.vue`, `.ts` and `.css` file.          |
| `src/utils/`                | Pure helpers: formatting, columns, semver, tar parsing, storage, URLs.   |
| `public/`                   | Static assets served as-is.                                              |
| `tests/unit/`               | Vitest unit tests, mirroring `src/api`, `src/utils`, `src/composables`.  |
| `tests/integration/`        | Vitest component tests mounted with `@vue/test-utils`.                   |
| `tests/e2e/`                | Playwright end-to-end tests. `visual/` holds the screenshot run.         |
| `tests/helpers/`            | Shared test helpers: fetch stubs and mocks, column key helpers.          |
| `tests/fixtures/`           | Shared test data: dependency rows, registry docs, tarball builders.      |
| `docs/`                     | Project docs: intent, features, roadmap, ideas, changelog.               |

## Stack

- Vue 3 with single-file components
- Vite for the dev server and build
- Zod for package.json validation
- Built-in `t()` helper with JSON message catalogs for UI text
- vue-json-pretty for the raw JSON viewer, vuedraggable for column reordering
- Vitest with jsdom for unit and component tests; fake-indexeddb stands in
  for IndexedDB, which jsdom lacks
- Playwright for end-to-end tests
- oxlint and oxfmt for linting and formatting

## Configuration

Copy `.env.example` to `.env.local` and fill in the values you need. Vite
inlines every `VITE_*` variable into the client bundle. The GitHub token is
not a build setting: each user enters their own in the settings menu, so a
public build carries no token.

- `VITE_FETCH_CONCURRENCY`: default number of packages fetched in parallel
  per table. Defaults to 5.
- `VITE_FETCH_TIMEOUT_MS`: default milliseconds before a network request is
  aborted. Defaults to 30000.

Numeric settings must be positive integers up to 2147483647, the largest
delay browser timers support. Any other value logs a warning in the browser
console and falls back to the default.

Column visibility, column order and the "shrink columns" toggle are user
settings. The app stores them in `localStorage`. So does `src/settings.ts`:
CORS proxy, fetch timeout, concurrency, theme, font size and padding. The `.env` values only seed the
defaults for timeout and concurrency.

`src/utils/githubTokenStorage.ts` keeps the GitHub token AES-GCM encrypted:
IV and ciphertext in `localStorage`, the non-extractable key in the
IndexedDB database `package-json-info`. `main.js` decrypts it into memory
before mounting the app, waiting at most `TOKEN_LOAD_TIMEOUT_MS` since
IndexedDB can hang; a late token refetches the tables. It also mirrors the display settings onto `<html>`:
`data-theme` picks the `color-scheme` that drives every `light-dark()` color
in `style.css`, and `--font-scale` / `--space-scale` multiply font sizes and
paddings.

## Translations

All user-facing text lives in `src/i18n/locales/en.json`. Look up a message
with `t("group.key")`. Placeholders such as `{name}` are filled from the
second argument: `t("errors.dependencyNotFound", { name })`. Components
return `t` from `setup()` so templates can call it. A unit test fails when
code uses a literal key that is missing from the catalog.

## Run

Install dependencies:

```sh
npm install
```

Start the dev server:

```sh
npm run dev
```

Preview the production build:

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
`unstubGlobals` in `vite.config.js`), so test files need no cleanup hooks
for them.

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
