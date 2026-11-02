import { DEFAULT_FETCH_CONCURRENCY, DEFAULT_FETCH_TIMEOUT_MS, MAX_CONFIG_INT } from "./constants";

/**
 * Parses an env value as a positive integer up to MAX_CONFIG_INT. Empty
 * values use `fallback`; invalid ones (zero, negative, fractional,
 * non-numeric, too large) warn and use it.
 */
export function readPositiveInt(name: string, raw: string | undefined, fallback: number): number {
    if (raw == null || raw.trim() === "") {
        return fallback;
    }
    const value = Number(raw);
    if (Number.isInteger(value) && value > 0 && value <= MAX_CONFIG_INT) {
        return value;
    }
    console.warn(
        `Ignoring ${name}="${raw}": expected a positive integer up to ${MAX_CONFIG_INT}. Using ${fallback}.`,
    );
    return fallback;
}

/**
 * Defaults read from `.env` at build time (see `.env.example`). VITE_*
 * values are inlined into the client bundle; users change them in settings.
 */
export const config = {
    fetchConcurrency: readPositiveInt(
        "VITE_FETCH_CONCURRENCY",
        import.meta.env.VITE_FETCH_CONCURRENCY,
        DEFAULT_FETCH_CONCURRENCY,
    ),
    fetchTimeoutMs: readPositiveInt(
        "VITE_FETCH_TIMEOUT_MS",
        import.meta.env.VITE_FETCH_TIMEOUT_MS,
        DEFAULT_FETCH_TIMEOUT_MS,
    ),
};
