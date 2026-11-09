import { MAX_CONFIG_INT } from "../constants";

/** True for a positive integer small enough for a browser timer. */
export function isConfigInt(value: number): boolean {
    return Number.isInteger(value) && value > 0 && value <= MAX_CONFIG_INT;
}

/**
 * Parses a config value as a positive integer up to MAX_CONFIG_INT. Empty
 * values use `fallback`; invalid ones (zero, negative, fractional,
 * non-numeric, too large) warn and use it.
 */
export function readPositiveInt(name: string, raw: string | undefined, fallback: number): number {
    if (raw == null || raw.trim() === "") {
        return fallback;
    }
    const value = Number(raw);
    if (isConfigInt(value)) {
        return value;
    }
    console.warn(
        `Ignoring ${name}="${raw}": expected a positive integer up to ${MAX_CONFIG_INT}. Using ${fallback}.`,
    );
    return fallback;
}
