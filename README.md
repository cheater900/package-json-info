# Package JSON Info

A web app that reads a `package.json` and produces a rich, browsable summary
table of its dependencies and devDependencies.

## Goal

Let a user bring in a `package.json` from wherever they have it, and get back
a table that tells them, at a glance, how healthy and active every dependency
is — without having to open npm, GitHub, and changelogs one tab at a time.

## Input methods

The app accepts a `package.json` from any of the following sources:

- **Clipboard content** — paste the raw JSON directly.
- **Git URL** — point at a repository containing a `package.json`.
- **File upload** — pick a local `package.json` file.
- **File URL** — fetch a `package.json` from a remote URL.

## Output: the dependency summary table

Once a `package.json` is loaded, the app parses its `dependencies` and
`devDependencies` and renders one row per package. Each row includes, when
the data is available:

- Source code URL (repository link)
- Last updated date
- Last released date
- Open PR count
- Closed PR count
- npm weekly downloads
- Stars (GitHub / GitLab / Codeberg, whichever hosts the source)
- Open issues count
- Closed issues count
- List of the package's own dependencies
- A "load this package's table" button (see below)

## Transitive dependency resolution

Direct `dependencies`/`devDependencies` are only the tip of what a package
manager actually installs. To show the real footprint of a `package.json`,
the app recursively walks each package's own dependency tree — fetching each
dependency's `package.json` in turn, then its dependencies' `package.json`
files, and so on — the same way a package manager would resolve the tree.

This should be done gracefully:

- **Deduplicate** shared dependencies encountered multiple times across the
  tree, so they're only counted once (mirroring how a package manager
  hoists/dedupes).
- **Cap recursion depth / detect cycles** so a malformed or circular
  dependency graph can't cause runaway fetching.
- **Tolerate partial failures** — if a nested package's metadata can't be
  fetched (rate limits, missing registry entry, network error), skip it and
  continue rather than failing the whole resolution.
- **Surface the total resolved dependency count** (direct + transitive) as
  a summary figure, distinct from the direct dependency count already shown
  per row.

## Package drill-down / history

Every row has a button to load that package's own `package.json` as the new
input for the table. Clicking it:

1. Fetches the `package.json` for that row's package.
2. Replaces the current table with a new summary table generated from it.
3. Records the navigation in a history stack, so the user can move back and
   forth between previously loaded tables (similar to browser back/forward)
   without re-fetching or losing earlier results.

## Status

This repository currently only contains the project goals and scaffolding.
Implementation has not started yet.
