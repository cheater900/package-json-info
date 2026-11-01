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

## Settings menu

A gear-icon dropdown with user settings stored in `localStorage`:

- GitHub token entered by the user
- Network proxy
- Display theme, font size and padding
