import type { DependencyListId, DependencyRow, PackageInput } from "../../core/types";
import type { PackageJson } from "../../core/utils/packageJson";
import type { WorkspaceContext } from "../../core/utils/workspaces";

/** Where a package.json was loaded from, when a link can load it again. */
export type EntrySource =
    | { kind: "url"; url: string }
    | { kind: "dependency"; name: string; version: string }
    | { kind: "workspace"; path: string };

/**
 * One visited package.json state. `deps`/`devDeps` start out null (not yet
 * fetched); once fetched they're cached here, tagged with the
 * visibleColumns set that was active at fetch time, so a later revisit can
 * tell whether the cached data still covers every currently-visible column.
 * `workspace` is set when the package.json came from a monorepo on GitHub.
 * `source` is null for input a link cannot reload (clipboard, file, built-in).
 */
export type HistoryEntry = {
    content: string;
    pkg: PackageJson;
    workspace: WorkspaceContext | null;
    source: EntrySource | null;
    deps: DependencyRow[] | null;
    devDeps: DependencyRow[] | null;
    visibleColumnsSnapshot: ReadonlySet<string> | null;
};

/** Entry whose `deps`/`devDeps` are fetched. */
export type FetchedHistoryEntry = HistoryEntry & {
    deps: DependencyRow[];
    devDeps: DependencyRow[];
};

/** Rows of one table holding every column in `columns`; null once the shown package.json changed. */
export type LoadRows = (
    list: DependencyListId,
    columns: ReadonlySet<string>,
) => Promise<DependencyRow[] | null>;

/** Dependency table as dialogs list it. */
export type TableRef = {
    id: DependencyListId;
    title: string;
};

export type TableWithRows = TableRef & {
    dependencies: DependencyRow[];
};

export type HistoryPosition = {
    history: HistoryEntry[];
    index: number;
};

export function createHistoryEntry(
    content: string,
    pkg: PackageJson,
    workspace: WorkspaceContext | null = null,
    source: EntrySource | null = null,
): HistoryEntry {
    return {
        content,
        pkg,
        workspace,
        source,
        deps: null,
        devDeps: null,
        visibleColumnsSnapshot: null,
    };
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

/** Keys of `visibleColumns` missing from `snapshot`; every key when `snapshot` is null. */
export function columnsMissingFrom(
    snapshot: ReadonlySet<string> | null,
    visibleColumns: ReadonlySet<string>,
): Set<string> {
    return new Set([...visibleColumns].filter((key) => !snapshot?.has(key)));
}

/**
 * True if the entry's cached deps/devDeps hold data for every visible
 * column: fetched under the same columns or a superset. Hiding a column
 * then needs no fetch.
 */
export function entryCoversColumns(
    entry: HistoryEntry,
    visibleColumns: ReadonlySet<string>,
): entry is FetchedHistoryEntry {
    return (
        entry.deps !== null &&
        entry.devDeps !== null &&
        entry.visibleColumnsSnapshot !== null &&
        columnsMissingFrom(entry.visibleColumnsSnapshot, visibleColumns).size === 0
    );
}

/** Row that failed, holds a failed lookup, or was built from stored values after one. */
export function isRowRetryable(row: DependencyRow): boolean {
    return "error" in row || row.staleSince != null || row.failedLookups != null;
}

function rowKey(row: PackageInput) {
    return `${row.name}@${row.version}`;
}

/** `rows` with each row of a replacement's name and version swapped for it. */
export function replaceRows(rows: DependencyRow[], replacements: DependencyRow[]): DependencyRow[] {
    const byKey = new Map(replacements.map((row) => [rowKey(row), row]));
    return rows.map((row) => byKey.get(rowKey(row)) ?? row);
}

function hasRowToRetry(rows: DependencyRow[]): boolean {
    return rows.some(isRowRetryable);
}

/**
 * True if a history entry's cached deps/devDeps are still good for the
 * given visibleColumns - covering every visible column, with no failed
 * rows - so navigating to it needs no fetch. Failed rows, rows with
 * failed lookups, and rows showing stored values count as stale so
 * revisiting an entry retries them.
 */
export function isEntryCacheValid(
    entry: HistoryEntry,
    visibleColumns: ReadonlySet<string>,
): entry is FetchedHistoryEntry {
    return (
        entryCoversColumns(entry, visibleColumns) &&
        !hasRowToRetry(entry.deps) &&
        !hasRowToRetry(entry.devDeps)
    );
}

/**
 * `tables` with their rows for `columns`, loaded in parallel through
 * `loadRows`; null when any list comes back null: the shown package.json
 * changed mid-load, so no row set is valid.
 */
export async function loadTablesWithRows(
    tables: readonly TableRef[],
    columns: ReadonlySet<string>,
    loadRows: LoadRows,
): Promise<TableWithRows[] | null> {
    const rows = await Promise.all(tables.map((table) => loadRows(table.id, columns)));
    if (!rows.every((list) => list !== null)) {
        return null;
    }
    return tables.map((table, i) => ({ id: table.id, title: table.title, dependencies: rows[i] }));
}
