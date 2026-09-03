export type ColumnDef = {
    key: string;
    label: string;
    sortable: boolean;
};

export const DEPENDENCY_TABLE_COLUMNS: ColumnDef[] = [
    { key: "name", label: "Name", sortable: true },
    { key: "version", label: "Version", sortable: false },
    { key: "versionDate", label: "Version Date", sortable: true },
    { key: "latestVersion", label: "Latest version", sortable: false },
    { key: "latestReleaseDate", label: "Latest release date", sortable: true },
    { key: "latestUpdateDate", label: "Latest update date", sortable: true },
    { key: "isOutdated", label: "Outdated", sortable: true },
    { key: "weeklyDownloads", label: "Weekly downloads", sortable: true },
    { key: "sourceCode", label: "Source code", sortable: false },
    { key: "gitStars", label: "Git stars", sortable: true },
    { key: "openPRs", label: "Open PRs", sortable: true },
    { key: "closedPRs", label: "Closed PRs", sortable: true },
    { key: "openIssues", label: "Open issues", sortable: true },
    { key: "closedIssues", label: "Closed issues", sortable: true },
    { key: "dependencies", label: "Dependencies", sortable: false },
    { key: "license", label: "License", sortable: false },
    { key: "deprecated", label: "Deprecated", sortable: false },
    { key: "vulnerabilityCount", label: "Vulnerabilities", sortable: true },
    { key: "bundleSizeGzip", label: "Bundle size (gzip)", sortable: true },
    { key: "maintainers", label: "Maintainers", sortable: false },
    { key: "loadAction", label: "Load", sortable: false },
];

/**
 * Columns that can never be hidden: Name (identity) and the drill-down
 * "load this package's table" action, which needs to stay reachable. Not
 * tracked in a visibleColumns set at all - isColumnVisible treats them as
 * visible unconditionally.
 */
const ALWAYS_VISIBLE_COLUMNS = new Set(["name", "loadAction"]);

/** Every column except the always-visible ones above can be toggled. */
export const TOGGLEABLE_COLUMNS = DEPENDENCY_TABLE_COLUMNS.filter(
    (c) => !ALWAYS_VISIBLE_COLUMNS.has(c.key),
);

/**
 * Toggleable columns kept hidden until the user opts in: vulnerabilityCount
 * and bundleSizeGzip depend on genuinely third-party services (OSV,
 * Bundlephobia) rather than the npm registry or a repository host, and
 * maintainers is hidden simply to keep the table's default view narrower -
 * its data still comes from the npm registry like most other columns.
 */
const INITIALLY_HIDDEN_COLUMN_KEYS = new Set([
    "vulnerabilityCount",
    "bundleSizeGzip",
    "maintainers",
]);

/** Toggleable columns visible by default - every other toggleable column. */
export const DEFAULT_VISIBLE_COLUMNS: ReadonlySet<string> = new Set(
    TOGGLEABLE_COLUMNS.map((c) => c.key).filter((key) => !INITIALLY_HIDDEN_COLUMN_KEYS.has(key)),
);

/**
 * At least this many columns must stay visible at all times: the
 * always-visible ones, plus at least one real data column (so hiding
 * columns can never leave the table down to just Name and the Load
 * button, with no actual dependency data showing).
 */
export const MIN_VISIBLE_COLUMNS = ALWAYS_VISIBLE_COLUMNS.size + 1;

export function isColumnVisible(visibleColumns: ReadonlySet<string>, key: string): boolean {
    return ALWAYS_VISIBLE_COLUMNS.has(key) || visibleColumns.has(key);
}

/**
 * True if `visibleColumns` (the currently-shown toggleable column keys)
 * still meets MIN_VISIBLE_COLUMNS once the always-visible columns are
 * counted in alongside it.
 */
export function meetsMinVisible(visibleColumns: ReadonlySet<string>): boolean {
    return ALWAYS_VISIBLE_COLUMNS.size + visibleColumns.size >= MIN_VISIBLE_COLUMNS;
}

/**
 * True if `key` is currently visible and hiding it would drop the total
 * visible column count below MIN_VISIBLE_COLUMNS. A column that's already
 * hidden never violates the minimum (showing it can only increase the
 * visible count).
 */
export function wouldViolateMinVisible(visibleColumns: ReadonlySet<string>, key: string): boolean {
    if (ALWAYS_VISIBLE_COLUMNS.has(key)) return false;
    if (!visibleColumns.has(key)) return false;
    const next = new Set(visibleColumns);
    next.delete(key);
    return !meetsMinVisible(next);
}

/**
 * Returns a new visible-columns set with `key` toggled. Always-visible
 * columns are never added or removed (they're implicitly visible
 * regardless of set membership), and hiding a column that would violate
 * MIN_VISIBLE_COLUMNS is ignored (the returned set is unchanged, same
 * reference-inequality contract as a normal toggle so callers can always
 * just reassign).
 */
export function toggleColumnVisibility(
    visibleColumns: ReadonlySet<string>,
    key: string,
): Set<string> {
    const next = new Set(visibleColumns);
    if (ALWAYS_VISIBLE_COLUMNS.has(key)) return next;
    if (next.has(key)) {
        if (!wouldViolateMinVisible(visibleColumns, key)) {
            next.delete(key);
        }
    } else {
        next.add(key);
    }
    return next;
}
