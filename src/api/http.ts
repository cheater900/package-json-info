import { HTTP_NOT_FOUND, PROXY_URL_PLACEHOLDER } from "../constants";
import { t } from "../i18n";
import { settings } from "../settings";

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

/**
 * Routes `url` through the CORS proxy template: `{url}` is replaced by the
 * encoded target, otherwise the target is appended. Empty proxy = no proxy.
 */
export function proxiedUrl(url: string, proxy: string = settings.proxyUrl): string {
    if (!proxy) {
        return url;
    }
    if (!proxy.includes(PROXY_URL_PLACEHOLDER)) {
        return proxy + url;
    }
    return proxy.replace(PROXY_URL_PLACEHOLDER, encodeURIComponent(url));
}

/**
 * `fetch` aborted after `settings.fetchTimeoutMs`, so a stalled server can't
 * hang the app. Goes through the proxy unless it carries an Authorization
 * header: a token must only ever reach its own API host.
 */
export function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
    const isAuthorized = new Headers(init.headers).has("Authorization");
    return fetch(isAuthorized ? url : proxiedUrl(url), {
        ...init,
        signal: AbortSignal.timeout(settings.fetchTimeoutMs),
    });
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
