import { config } from "../config";
import { t } from "../i18n";

export type HttpHeaders = Record<string, string>;

/** `fetch` aborted after `config.fetchTimeoutMs`, so a stalled server can't hang the app. */
export function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
    return fetch(url, { ...init, signal: AbortSignal.timeout(config.fetchTimeoutMs) });
}

/**
 * GETs a URL and parses the response as JSON.
 * Returns `null` on non-2xx responses; throws on network failure and timeout.
 */
export async function fetchJson<T>(url: string, headers: HttpHeaders = {}): Promise<T | null> {
    const response = await fetchWithTimeout(url, { headers });
    if (!response.ok) {
        return null;
    }
    return response.json() as Promise<T>;
}

/** GETs a URL as text. Throws on non-2xx responses, network failure, and timeout. */
export async function fetchText(url: string): Promise<string> {
    const response = await fetchWithTimeout(url);
    if (!response.ok) {
        throw new Error(t("errors.requestFailed", { status: response.status }));
    }
    return response.text();
}
