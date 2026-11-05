/**
 * Reads and JSON-parses a localStorage value. Returns undefined when the
 * key is absent, storage is unavailable (private browsing, disabled), or
 * the value is not valid JSON. Never throws.
 */
export function readStoredJson(key: string): unknown {
    try {
        const raw = localStorage.getItem(key);
        return raw == null ? undefined : JSON.parse(raw);
    } catch {
        return undefined;
    }
}

/**
 * JSON-serializes a value into localStorage. Does nothing when storage is
 * unavailable or full: the value just won't survive a reload. Never throws.
 */
export function writeStoredJson(key: string, value: unknown): void {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        return;
    }
}

/** Deletes a localStorage value. Does nothing when storage is unavailable. Never throws. */
export function removeStoredJson(key: string): void {
    try {
        localStorage.removeItem(key);
    } catch {
        return;
    }
}
