# Roadmap

Planned work, by area, highest priority first. Finished items move to
[CHANGELOG.md](CHANGELOG.md).

## Transitive dependency resolution

The app should walk each package's own dependency tree, the way a package
manager resolves it, to show the real footprint of a `package.json`.

- **Deduplicate** shared dependencies met several times across the tree, so
  each counts once.
- **Cap recursion depth and detect cycles** so a malformed or circular graph
  can't cause runaway fetching.
- **Tolerate partial failures**: skip a nested package whose metadata can't
  be fetched and continue.
- **Show the total resolved dependency count** (direct + transitive) as a
  summary figure.

## UX

- **Responsive layout**: the table stays usable on narrow viewports.
- **Keyboard and screen-reader support**: focus order, ARIA labels, and
  keyboard access for input controls, table rows, column drag and
  drill-down/history navigation.

## Reliability

- **Default branch for repo URL input**: only `main`/`master` are probed;
  resolve the real default branch (e.g. raw `HEAD` ref).
- **GitHub `/blob/<ref>/<path>` URL input**: ref and path are ignored, so
  the root `package.json` loads instead.
- **Max satisfying version for ranges**: version data uses the range floor
  (leading semver) today.
- **"Lookup failed" vs "no data"**: both show "-" in cells today.
- **Retry button for failed rows**: retry happens only on history revisit
  or column toggle.

## i18n

- **Second locale** plus runtime language switch (needs reactive locale or
  a move to vue-i18n).
- **Locale-aware number and date formatting**: `en-US` and
  `toDateString()` are hard-coded.
- **Browser-originated error text** (network failure, timeout) is not
  translated.

## Tests

- **Invalid-JSON e2e test**: target `.banner--error` instead of
  `getByRole("alert")`; failed rows also have `role="alert"`.
