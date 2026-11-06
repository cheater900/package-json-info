# Roadmap

Planned work, by area, highest priority first. Finished items move to
[CHANGELOG.md](CHANGELOG.md).

## CLI

Command-line app in `src/cli`, calling `src/core` like web app does.

- **Entry point and runner**: read package.json from path, URL or npm
  name; print dependency tables; Node run setup (JSON catalog import,
  bin script).
- **Core binding**: call `configureCore()` with settings from flags or
  env, GitHub token from env. Validate settings first, as app
  `settings.ts` does: core uses them as given (NaN timeout makes
  `AbortSignal.timeout` throw).
- **File lookup store** in place of IndexedDB, so offline fallback works.
- **Export to file**: write exporter `Blob` to disk in place of browser
  download helper.

## Transitive dependency resolution

Walk each package's own dependency tree, as package manager resolves it,
to show real footprint of `package.json`.

- **Deduplicate** shared dependencies met several times across tree, so
  each counts once.
- **Cap recursion depth and detect cycles** so malformed or circular graph
  cannot cause runaway fetching.
- **Tolerate partial failures**: skip nested package whose metadata fetch
  fails, continue.
- **Show total resolved dependency count** (direct + transitive) as
  summary figure.

## UX

- **Keyboard and screen-reader support**: focus order, ARIA labels,
  keyboard access for input controls, table rows, column drag and
  drill-down/history navigation.

## Reliability

- **Default branch for repo URL input**: app probes only `main`/`master`;
  resolve real default branch (e.g. raw `HEAD` ref).
- **Max satisfying version for ranges**: version data uses range floor
  (leading semver) today.

## i18n

- **Second locale** plus runtime language switch (needs reactive locale or
  move to vue-i18n).
- **Locale-aware number and date formatting**: `en-US` and
  `toDateString()` are hard-coded.
- **Browser-originated error text** (network failure, timeout) stays
  untranslated.
