import { config } from "../config";
import { HTTP_NOT_FOUND } from "../constants";
import { t } from "../i18n";

export type HttpHeaders = Record<string, string>;

export class HttpError extends Error {
    readonly status: number;

    constructor(status: number) {
        super(t("errors.requestFailed", { status }));
        this.status = status;
    }
}

/** `fetch` aborted after `config.fetchTimeoutMs`, so a stalled server can't hang the app. */
export function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
    return fetch(url, { ...init, signal: AbortSignal.timeout(config.fetchTimeoutMs) });
}

/**
 * Fetches a URL and parses the response as JSON. Returns `null` on 404
 * (resource doesn't exist). Throws HttpError on other non-2xx statuses
 * (rate limits, server errors) so callers don't cache transient failures,
 * and throws on network failure, timeout, or malformed JSON.
 */
export async function fetchJson<T>(url: string, init: RequestInit = {}): Promise<T | null> {
    const response = await fetchWithTimeout(url, init);
    if (response.status === HTTP_NOT_FOUND) {
        return null;
    }
    if (!response.ok) {
        throw new HttpError(response.status);
    }
    return response.json() as Promise<T>;
}

/** GETs a URL as text. Throws on non-2xx responses, network failure, and timeout. */
export async function fetchText(url: string): Promise<string> {
    const response = await fetchWithTimeout(url);
    if (!response.ok) {
        throw new HttpError(response.status);
    }
    return response.text();
}
