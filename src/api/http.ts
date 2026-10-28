import { config } from "../config";
import { HTTP_NOT_FOUND } from "../constants";
import { t } from "../i18n";

export type HttpHeaders = Record<string, string>;

export type FoundCandidate<T> = {
    candidate: T;
    response: Response;
};

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

/**
 * Requests `toUrl(candidate)` for each candidate in order and returns the
 * first one answering 2xx, with its response. A 404 moves on to the next
 * candidate; any other status throws HttpError so a rate limit or outage
 * isn't mistaken for "not found". Null when every candidate 404s.
 */
export async function findFirstFound<T>(
    candidates: readonly T[],
    toUrl: (candidate: T) => string,
    init: RequestInit = {},
): Promise<FoundCandidate<T> | null> {
    for (const candidate of candidates) {
        const response = await fetchWithTimeout(toUrl(candidate), init);
        if (response.ok) {
            return { candidate, response };
        }
        if (response.status !== HTTP_NOT_FOUND) {
            throw new HttpError(response.status);
        }
    }
    return null;
}
