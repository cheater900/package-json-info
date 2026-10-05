# Development

## Code layout

| Path                        | Purpose                                                                  |
| --------------------------- | ------------------------------------------------------------------------ |
| `src/main.js`               | App entry point. Mounts `App.vue`.                                       |
| `src/App.vue`, `src/App.ts` | Root component: input controls, tables, history controls, shared modal.  |
| `src/constants.ts`          | API base URLs, supported repo hosts, storage keys, display constants.    |
| `src/config.ts`             | Developer settings read from `.env` (see Configuration below).           |
| `src/types.ts`              | Shared `PackageInfo` / `PackageInput` / `PackageError` types.            |
| `src/api/`                  | Network code: npm registry, repo hosts, OSV, Bundlephobia, source trees. |
| `src/composables/`          | Vue state: column preferences, package.json history, input sources.      |
| `src/components/`           | Vue components. Each has its own `.vue`, `.ts` and `.css` file.          |
| `src/utils/`                | Pure helpers: formatting, columns, semver, tar parsing, storage, URLs.   |
| `public/`                   | Static assets served as-is.                                              |
| `tests/unit/`               | Vitest unit tests, mirroring `src/api`, `src/utils`, `src/composables`.  |
| `tests/integration/`        | Vitest component tests mounted with `@vue/test-utils`.                   |
| `tests/e2e/`                | Playwright end-to-end tests. `visual/` holds the screenshot run.         |
| `tests/helpers/`            | Shared test helpers: fetch mocks, column key helpers.                    |
| `tests/fixtures/`           | Shared test data: dependency rows, tarball builders.                     |

## Stack

- Vue 3 with single-file components
- Vite for the dev server and build
- Zod for package.json validation
- vue-json-pretty for the raw JSON viewer, vuedraggable for column reordering
- Vitest with jsdom for unit and component tests
- Playwright for end-to-end tests
- oxlint and oxfmt for linting and formatting

## Configuration

Copy `.env.example` to `.env.local` and fill in the values you need. Vite
inlines every `VITE_*` variable into the client bundle, so do not put a
privileged token into a build you publish.

- `VITE_GITHUB_TOKEN`: GitHub personal access token with no scopes. It raises
  the GitHub API rate limit from 60 to 5000 requests per hour. Leave it empty
  to call GitHub anonymously.
- `VITE_FETCH_CONCURRENCY`: number of packages fetched in parallel per table.
  Defaults to 5.

Column visibility, column order and the "shrink columns" toggle are user
settings. The app stores them in `localStorage`.

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
