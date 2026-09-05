import {
    TOGGLEABLE_COLUMNS,
    DEFAULT_VISIBLE_COLUMNS,
    DEFAULT_COLUMN_ORDER,
    meetsMinVisible,
    orderColumns,
} from "./tableColumns";

const STORAGE_KEY = "package-json-info:visibleColumns";
const ORDER_STORAGE_KEY = "package-json-info:columnOrder";
const SHRINK_LABELS_STORAGE_KEY = "package-json-info:shrinkColumnLabels";

/**
 * Loads the persisted visible-columns preference from localStorage. Falls
 * back to DEFAULT_VISIBLE_COLUMNS whenever storage is unavailable (e.g.
 * private browsing, disabled storage), holds nothing yet, holds something
 * that isn't a JSON array of column keys, or - after dropping any stored
 * key that no longer matches a real toggleable column (renamed/removed in
 * a later version) - would leave fewer than MIN_VISIBLE_COLUMNS visible.
 * Never throws.
 */
export function loadVisibleColumns(): Set<string> {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw == null) {
            return new Set(DEFAULT_VISIBLE_COLUMNS);
        }

        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
            return new Set(DEFAULT_VISIBLE_COLUMNS);
        }

        const validKeys = new Set(TOGGLEABLE_COLUMNS.map((c) => c.key));
        const visible = new Set(
            parsed.filter((key) => typeof key === "string" && validKeys.has(key)),
        );

        if (!meetsMinVisible(visible)) {
            return new Set(DEFAULT_VISIBLE_COLUMNS);
        }

        return visible;
    } catch {
        return new Set(DEFAULT_VISIBLE_COLUMNS);
    }
}

/**
 * Persists the given visible-columns set to localStorage. Silently does
 * nothing if storage is unavailable or writing fails (e.g. quota exceeded,
 * private browsing) - a preference that can't be saved just doesn't
 * survive the next reload, rather than breaking the app. Never throws.
 */
export function saveVisibleColumns(visibleColumns: ReadonlySet<string>): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...visibleColumns]));
    } catch {
        // Storage unavailable/full/blocked - preference just won't persist.
    }
}

/**
 * Loads the persisted column-order preference from localStorage. Falls back
 * to DEFAULT_COLUMN_ORDER whenever storage is unavailable, holds nothing
 * yet, or holds something that isn't a JSON array of column keys. Any
 * stored key that no longer matches a real toggleable column is dropped,
 * and any real column missing from the stored order (e.g. added in a later
 * version) is appended at the end - see orderColumns. Never throws.
 */
export function loadColumnOrder(): string[] {
    try {
        const raw = localStorage.getItem(ORDER_STORAGE_KEY);
        if (raw == null) {
            return [...DEFAULT_COLUMN_ORDER];
        }

        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
            return [...DEFAULT_COLUMN_ORDER];
        }

        const order = parsed.filter((key): key is string => typeof key === "string");
        return orderColumns(order, TOGGLEABLE_COLUMNS).map((c) => c.key);
    } catch {
        return [...DEFAULT_COLUMN_ORDER];
    }
}

/**
 * Persists the given column order to localStorage. Silently does nothing if
 * storage is unavailable or writing fails - an order that can't be saved
 * just doesn't survive the next reload, rather than breaking the app.
 * Never throws.
 */
export function saveColumnOrder(order: readonly string[]): void {
    try {
        localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(order));
    } catch {
        // Storage unavailable/full/blocked - preference just won't persist.
    }
}

/**
 * Loads the persisted "shrink columns by abbreviation" preference from
 * localStorage. Defaults to false (full labels) whenever storage is
 * unavailable, holds nothing yet, or holds something that isn't the literal
 * JSON boolean `true`. Never throws.
 */
export function loadShrinkColumnLabels(): boolean {
    try {
        const raw = localStorage.getItem(SHRINK_LABELS_STORAGE_KEY);
        if (raw == null) {
            return false;
        }

        return JSON.parse(raw) === true;
    } catch {
        return false;
    }
}

/**
 * Persists the given "shrink columns by abbreviation" preference to
 * localStorage. Silently does nothing if storage is unavailable or writing
 * fails - a preference that can't be saved just doesn't survive the next
 * reload, rather than breaking the app. Never throws.
 */
export function saveShrinkColumnLabels(value: boolean): void {
    try {
        localStorage.setItem(SHRINK_LABELS_STORAGE_KEY, JSON.stringify(value));
    } catch {
        // Storage unavailable/full/blocked - preference just won't persist.
    }
}
