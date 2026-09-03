import {
    DEPENDENCY_TABLE_COLUMNS,
    TOGGLEABLE_COLUMNS,
    DEFAULT_HIDDEN_COLUMNS,
    MIN_VISIBLE_COLUMNS,
} from "./tableColumns";

const STORAGE_KEY = "package-json-info:hiddenColumns";

/**
 * Loads the persisted hidden-columns preference from localStorage. Falls
 * back to DEFAULT_HIDDEN_COLUMNS whenever storage is unavailable (e.g.
 * private browsing, disabled storage), holds nothing yet, holds something
 * that isn't a JSON array of column keys, or - after dropping any stored
 * key that no longer matches a real toggleable column (renamed/removed in
 * a later version) - would leave fewer than MIN_VISIBLE_COLUMNS visible.
 * Never throws.
 */
export function loadHiddenColumns(): Set<string> {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw == null) {
            return new Set(DEFAULT_HIDDEN_COLUMNS);
        }

        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
            return new Set(DEFAULT_HIDDEN_COLUMNS);
        }

        const validKeys = new Set(TOGGLEABLE_COLUMNS.map((c) => c.key));
        const hidden = new Set(
            parsed.filter((key) => typeof key === "string" && validKeys.has(key)),
        );

        const visibleCount = DEPENDENCY_TABLE_COLUMNS.length - hidden.size;
        if (visibleCount < MIN_VISIBLE_COLUMNS) {
            return new Set(DEFAULT_HIDDEN_COLUMNS);
        }

        return hidden;
    } catch {
        return new Set(DEFAULT_HIDDEN_COLUMNS);
    }
}

/**
 * Persists the given hidden-columns set to localStorage. Silently does
 * nothing if storage is unavailable or writing fails (e.g. quota exceeded,
 * private browsing) - a preference that can't be saved just doesn't
 * survive the next reload, rather than breaking the app. Never throws.
 */
export function saveHiddenColumns(hiddenColumns: ReadonlySet<string>): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...hiddenColumns]));
    } catch {
        // Storage unavailable/full/blocked - preference just won't persist.
    }
}
