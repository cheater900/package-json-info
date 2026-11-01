import {
    TOGGLEABLE_COLUMNS,
    DEFAULT_VISIBLE_COLUMNS,
    DEFAULT_COLUMN_ORDER,
    meetsMinVisible,
    orderColumns,
} from "./tableColumns";
import { readStoredJson, writeStoredJson } from "./storage";
import {
    STORAGE_KEY_VISIBLE_COLUMNS,
    STORAGE_KEY_COLUMN_ORDER,
    STORAGE_KEY_SHRINK_LABELS,
} from "../constants";

function readStoredStringArray(key: string): string[] | null {
    const stored = readStoredJson(key);
    if (!Array.isArray(stored)) {
        return null;
    }
    return stored.filter((item): item is string => typeof item === "string");
}

/**
 * Persisted visible-column keys, minus keys no longer matching a real
 * toggleable column. Falls back to DEFAULT_VISIBLE_COLUMNS when nothing
 * valid is stored or the result would break MIN_VISIBLE_COLUMNS.
 */
export function loadVisibleColumns(): Set<string> {
    const stored = readStoredStringArray(STORAGE_KEY_VISIBLE_COLUMNS);
    const validKeys = new Set(TOGGLEABLE_COLUMNS.map((c) => c.key));
    const visible = new Set(stored?.filter((key) => validKeys.has(key)));
    if (stored == null || !meetsMinVisible(visible)) {
        return new Set(DEFAULT_VISIBLE_COLUMNS);
    }
    return visible;
}

export function saveVisibleColumns(visibleColumns: ReadonlySet<string>): void {
    writeStoredJson(STORAGE_KEY_VISIBLE_COLUMNS, [...visibleColumns]);
}

/**
 * Persisted column order, normalized by orderColumns: stale keys dropped,
 * new columns appended. Falls back to DEFAULT_COLUMN_ORDER when nothing
 * valid is stored.
 */
export function loadColumnOrder(): string[] {
    const stored = readStoredStringArray(STORAGE_KEY_COLUMN_ORDER);
    if (stored == null) {
        return [...DEFAULT_COLUMN_ORDER];
    }
    return orderColumns(stored, TOGGLEABLE_COLUMNS).map((c) => c.key);
}

export function saveColumnOrder(order: readonly string[]): void {
    writeStoredJson(STORAGE_KEY_COLUMN_ORDER, order);
}

/** True only when the stored value is the literal JSON `true`. */
export function loadShrinkColumnLabels(): boolean {
    return readStoredJson(STORAGE_KEY_SHRINK_LABELS) === true;
}

export function saveShrinkColumnLabels(value: boolean): void {
    writeStoredJson(STORAGE_KEY_SHRINK_LABELS, value);
}
