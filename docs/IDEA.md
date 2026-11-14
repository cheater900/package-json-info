# Ideas

Features worth trying. Not planned; some may never get built. Idea moves to
[ROADMAP.md](ROADMAP.md) once planned.

## Input

- **Lockfile parsing**: read `pnpm-lock.yaml` / `yarn.lock` /
  `package-lock.json`, show resolved versions instead of semver ranges.
- **Merged workspaces table**: one table for every workspace of monorepo,
  with users of each dependency.
- **Workspaces on GitLab and Codeberg**: only GitHub repos list workspaces.
- **Workspace package names** in Workspace select, next to paths.
- **Drag-and-drop file upload**, next to file picker.

## UX

- **Share links for pasted or uploaded files**, and for sort, search and
  column state. Links carry only URL, dependency and workspace steps.
- **Diff view**: compare two `package.json` files side by side.
- **Persistent metadata cache** with visible "last checked" timestamps and
  manual refresh. Today stored values serve only as fallback.
- **Stored lookup cleanup**: size cap, expiry and clear button for
  fallback store.
- **Offline fallback for URL input**: only per-package lookups fall back to
  stored values.

## Settings

- **Live settings sync across tabs** through `storage` event, so two open
  tabs stop overwriting each other.
- **Default CORS proxy from `.env`** (`VITE_CORS_PROXY_URL`) for public
  deploy shipping own proxy.
- **Columns in settings menu**: move Columns panel and shrink toggle into
  Display section.
