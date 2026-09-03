import { TOGGLEABLE_COLUMNS, DEFAULT_VISIBLE_COLUMNS, meetsMinVisible } from "./tableColumns";

const STORAGE_KEY = "package-json-info:visibleColumns";

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
