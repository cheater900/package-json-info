import { t } from "../i18n";

export type ColumnDef = {
    key: string;
    label: string;
    sortable: boolean;
    // How this column's cell content renders. Omitted means plain formatted
    // text (see formatCell). DependenciesTable dispatches on this instead of
    // hardcoding column keys in its template.
    render?: "link" | "button" | "health";
    // Whether this column's text can run long enough to need ellipsis
    // truncation with click-to-expand (e.g. dependency/maintainer lists,
    // deprecation notices). Dates, numbers, and link/button columns never
    // set this - their content is always short or isn't text at all.
    truncatable?: boolean;
};

/** The row's identity column: always shown, left-aligned, not draggable. */
export const NAME_COLUMN_KEY = "name";

const COLUMN_SPECS: Omit<ColumnDef, "label">[] = [
    { key: NAME_COLUMN_KEY, sortable: true },
    { key: "version", sortable: false },
    { key: "versionDate", sortable: true },
    { key: "latestVersion", sortable: false },
    { key: "latestReleaseDate", sortable: true },
    { key: "latestUpdateDate", sortable: true },
    { key: "isOutdated", sortable: true },
    { key: "healthScore", sortable: true, render: "health" },
    { key: "weeklyDownloads", sortable: true },
    { key: "sourceCode", sortable: false, render: "link" },
    { key: "sourceCodeTree", sortable: false, render: "button" },
    { key: "gitStars", sortable: true },
    { key: "openPRs", sortable: true },
    { key: "closedPRs", sortable: true },
    { key: "openIssues", sortable: true },
    { key: "closedIssues", sortable: true },
    { key: "dependencies", sortable: false, truncatable: true },
    { key: "license", sortable: false, truncatable: true },
    { key: "deprecated", sortable: false, truncatable: true },
    { key: "vulnerabilityCount", sortable: true },
    { key: "bundleSizeGzip", sortable: true },
    { key: "maintainers", sortable: false, truncatable: true },
];

export const DEPENDENCY_TABLE_COLUMNS: ColumnDef[] = COLUMN_SPECS.map((spec) => ({
    ...spec,
    label: t(`columns.${spec.key}`),
}));

/** Never tracked in a visibleColumns set; isColumnVisible treats them as visible. */
const ALWAYS_VISIBLE_COLUMNS = new Set([NAME_COLUMN_KEY]);

/** Every column except the always-visible ones above can be toggled. */
export const TOGGLEABLE_COLUMNS = DEPENDENCY_TABLE_COLUMNS.filter(
    (c) => !ALWAYS_VISIBLE_COLUMNS.has(c.key),
);

/**
 * Toggleable columns kept hidden until the user opts in: vulnerabilityCount
 * and bundleSizeGzip depend on genuinely third-party services (OSV,
 * Bundlephobia) rather than the npm registry or a repository host,
 * maintainers is hidden simply to keep the table's default view narrower -
 * its data still comes from the npm registry like most other columns - and
 * sourceCodeTree needs an extra GitHub API call per row whenever a package's
 * own tarball doesn't have a dist URL, so it stays opt-in too.
 */
const INITIALLY_HIDDEN_COLUMN_KEYS = new Set([
    "vulnerabilityCount",
    "bundleSizeGzip",
    "maintainers",
    "sourceCodeTree",
]);

/** Toggleable columns visible by default - every other toggleable column. */
export const DEFAULT_VISIBLE_COLUMNS: ReadonlySet<string> = new Set(
    TOGGLEABLE_COLUMNS.map((c) => c.key).filter((key) => !INITIALLY_HIDDEN_COLUMN_KEYS.has(key)),
);

/**
 * At least this many columns must stay visible at all times: the
 * always-visible ones, plus at least one real data column (so hiding
 * columns can never leave the table down to just Name, with no actual
 * dependency data showing).
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
    if (ALWAYS_VISIBLE_COLUMNS.has(key)) {
        return false;
    }
    if (!visibleColumns.has(key)) {
        return false;
    }
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
    if (ALWAYS_VISIBLE_COLUMNS.has(key)) {
        return next;
    }
    if (!next.has(key)) {
        next.add(key);
        return next;
    }
    if (!wouldViolateMinVisible(visibleColumns, key)) {
        next.delete(key);
    }
    return next;
}

/** Toggleable columns in their declaration order - the order used when no user preference is saved yet. */
export const DEFAULT_COLUMN_ORDER: readonly string[] = TOGGLEABLE_COLUMNS.map((c) => c.key);

/**
 * Maps an ordered list of column keys to their ColumnDefs, drawn from
 * `columns`. Unknown/stale keys (no longer a real column) are dropped;
 * duplicate keys keep only their first occurrence; any column in `columns`
 * missing from `order` is appended at the end, in `columns`' own declaration
 * order - so an empty order, or one saved before a schema change added a new
 * column, still surfaces every real column.
 */
export function orderColumns(order: readonly string[], columns: readonly ColumnDef[]): ColumnDef[] {
    const byKey = new Map(columns.map((c) => [c.key, c]));
    const seen = new Set<string>();
    const ordered: ColumnDef[] = [];
    for (const key of order) {
        const col = byKey.get(key);
        if (!col || seen.has(key)) {
            continue;
        }
        ordered.push(col);
        seen.add(key);
    }
    for (const col of columns) {
        if (!seen.has(col.key)) {
            ordered.push(col);
        }
    }
    return ordered;
}

/**
 * Merges a drag-reorder of the currently-visible columns back into the full
 * persisted column order. `fullOrder` is a permutation of every toggleable
 * column key; `newVisibleOrder` is a permutation of just the keys in
 * `fullOrder` that are currently visible, in their new drag order. Each
 * hidden column keeps its own exact slot in the result - only the slots that
 * held visible columns are refilled, in sequence, from `newVisibleOrder`.
 */
export function mergeColumnOrder(
    fullOrder: readonly string[],
    newVisibleOrder: readonly string[],
): string[] {
    const visibleSet = new Set(newVisibleOrder);
    const queue = [...newVisibleOrder];
    return fullOrder.map((key) => (visibleSet.has(key) ? queue.shift()! : key));
}

/**
 * Abbreviates a multi-word column label to its initials (e.g. "Latest
 * release date" -> "LRD", "Version Date" -> "VD"), for the "shrink columns
 * by abbreviation" display preference. A label with fewer than two words
 * (e.g. "Name", "Outdated") is returned unchanged - there's nothing to
 * usefully shrink.
 */
export function abbreviateLabel(label: string): string {
    const words = label.trim().split(/\s+/).filter(Boolean);
    if (words.length < 2) {
        return label;
    }
    return words.map((word) => word.match(/[A-Za-z]/)?.[0].toUpperCase() ?? "").join("");
}
