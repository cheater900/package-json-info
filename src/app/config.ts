import { DEFAULT_FETCH_CONCURRENCY, DEFAULT_FETCH_TIMEOUT_MS } from "../core/constants";
import { readPositiveInt } from "../core/utils/configInt";

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
