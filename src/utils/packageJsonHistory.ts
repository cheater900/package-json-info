import type { DependencyRow } from "../types";
import type { PackageJson } from "./packageJson";
import type { WorkspaceContext } from "./workspaces";

/**
 * One visited package.json state. `deps`/`devDeps` start out null (not yet
 * fetched); once fetched they're cached here, tagged with the
 * visibleColumns set that was active at fetch time, so a later revisit can
 * tell whether the cached data still covers every currently-visible column.
 * `workspace` is set when the package.json came from a monorepo on GitHub.
 */
export type HistoryEntry = {
    content: string;
    pkg: PackageJson;
    workspace: WorkspaceContext | null;
    deps: DependencyRow[] | null;
    devDeps: DependencyRow[] | null;
    visibleColumnsSnapshot: ReadonlySet<string> | null;
};

/** Entry whose `deps`/`devDeps` are fetched. */
export type FetchedHistoryEntry = HistoryEntry & {
    deps: DependencyRow[];
    devDeps: DependencyRow[];
};

export type HistoryPosition = {
    history: HistoryEntry[];
    index: number;
};

export function createHistoryEntry(
    content: string,
    pkg: PackageJson,
    workspace: WorkspaceContext | null = null,
): HistoryEntry {
    return { content, pkg, workspace, deps: null, devDeps: null, visibleColumnsSnapshot: null };
}

/**
 * Pushes a new entry onto the history stack at `index + 1`, discarding any
 * "forward" entries beyond the current position - the same rule browser
 * history follows: navigating back and then loading something new drops
 * the old future.
 */
export function pushHistoryEntry(
    history: HistoryEntry[],
    index: number,
    entry: HistoryEntry,
): HistoryPosition {
    const next = [...history.slice(0, index + 1), entry];
    return { history: next, index: next.length - 1 };
}

export function canGoBack(index: number): boolean {
    return index > 0;
}

export function canGoForward(history: HistoryEntry[], index: number): boolean {
    return index < history.length - 1;
}

/** True if two visible-column sets have exactly the same members. */
export function visibleColumnsEqual(
    a: ReadonlySet<string> | null,
    b: ReadonlySet<string> | null,
): boolean {
    if (a == null || b == null) {
        return false;
    }
    if (a.size !== b.size) {
        return false;
    }
    for (const key of a) {
        if (!b.has(key)) {
            return false;
        }
    }
    return true;
}

/** Rows that failed, or were built from stored values after a failed live lookup. */
function hasFailedRow(rows: DependencyRow[]): boolean {
    return rows.some((row) => "error" in row || row.staleSince != null);
}

/**
 * True if a history entry's cached deps/devDeps are still good for the
 * given visibleColumns - fetched under the same column visibility, with no
 * failed rows - so navigating to it needs no fetch. Failed rows, and rows
 * showing stored values, count as stale so revisiting an entry retries them.
 */
export function isEntryCacheValid(
    entry: HistoryEntry,
    visibleColumns: ReadonlySet<string>,
): entry is FetchedHistoryEntry {
    return (
        entry.deps !== null &&
        entry.devDeps !== null &&
        !hasFailedRow(entry.deps) &&
        !hasFailedRow(entry.devDeps) &&
        visibleColumnsEqual(entry.visibleColumnsSnapshot, visibleColumns)
    );
}
