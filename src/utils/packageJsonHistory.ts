/**
 * One visited package.json state. `deps`/`devDeps` start out null (not yet
 * fetched); once fetched they're cached here, tagged with the
 * visibleColumns set that was active at fetch time, so a later revisit can
 * tell whether the cached data still covers every currently-visible column.
 */
export type HistoryEntry = {
    content: string;
    pkg: Record<string, unknown>;
    deps: unknown[] | null;
    devDeps: unknown[] | null;
    visibleColumnsSnapshot: ReadonlySet<string> | null;
};

export function createHistoryEntry(content: string, pkg: Record<string, unknown>): HistoryEntry {
    return { content, pkg, deps: null, devDeps: null, visibleColumnsSnapshot: null };
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
): { history: HistoryEntry[]; index: number } {
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
    if (a == null || b == null) return false;
    if (a.size !== b.size) return false;
    for (const key of a) {
        if (!b.has(key)) return false;
    }
    return true;
}

/**
 * True if a history entry's cached deps/devDeps are still good for the
 * given visibleColumns - i.e. they were already fetched, under the same
 * column visibility that's active now - so navigating to this entry needs
 * no fetch at all. False for a never-fetched entry, or one fetched under a
 * different column set (some currently-visible column's data might be
 * missing).
 */
export function isEntryCacheValid(
    entry: HistoryEntry,
    visibleColumns: ReadonlySet<string>,
): boolean {
    return (
        entry.deps !== null &&
        entry.devDeps !== null &&
        visibleColumnsEqual(entry.visibleColumnsSnapshot, visibleColumns)
    );
}
