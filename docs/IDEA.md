# Ideas

Features worth trying. Not planned; some may never be built. An idea moves
to [ROADMAP.md](ROADMAP.md) once planned.

## Input

- **Lockfile parsing**: read `pnpm-lock.yaml` / `yarn.lock` /
  `package-lock.json` to show resolved versions instead of semver ranges.
- **Merged workspaces table**: one table for every workspace of a
  monorepo, with each dependency's users.
- **Workspaces on GitLab and Codeberg**: only GitHub repos list workspaces.
- **Workspace package names** in the Workspace select, next to the paths.
- **Drag-and-drop file upload**, next to the file picker.

## UX

- **Share links for pasted or uploaded files**, and for sort, search and
  column state. Links carry only URL, dependency and workspace steps.
- **Diff view**: compare two `package.json` files side by side.
- **Persistent metadata cache** with visible "last checked" timestamps and
  a manual refresh. Stored values are used only as fallback today.
- **Stored lookup cleanup**: size cap, expiry and a clear button for the
  fallback store.
- **Offline fallback for the URL input**: only per-package lookups fall
  back to stored values.

## Settings

- **Live settings sync across tabs** through the `storage` event, so two
  open tabs stop overwriting each other.
- **Default CORS proxy from `.env`** (`VITE_CORS_PROXY_URL`) for a public
  deploy that ships its own proxy.
- **Columns in the settings menu**: move the Columns panel and the shrink
  toggle into the Display section.
