# Ideas

Features worth trying. Not planned; some may never be built. An idea moves
to [ROADMAP.md](ROADMAP.md) once planned.

## Input

- **Lockfile parsing**: read `pnpm-lock.yaml` / `yarn.lock` /
  `package-lock.json` to show resolved versions instead of semver ranges.
- **Monorepo / workspaces support**: detect `workspaces` and let the user
  pick which workspace's `package.json` to summarize, or merge them.
- **Drag-and-drop file upload**, next to the file picker.

## Table / data

- **Health/risk score** per package, combining staleness, open issue ratio,
  maintainer count and similar signals into one indicator.

## UX

- **Shareable table state**: encode the loaded source and drill-down
  history in the URL so a view can be linked.
- **Export** the table as CSV, JSON or Markdown.
- **Diff view**: compare two `package.json` files side by side.
- **Persistent metadata cache** with visible "last checked" timestamps and
  a manual refresh.
- **Offline-tolerant mode**: show cached data when live lookups fail,
  marked as stale.
