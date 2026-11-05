import {
    GITHUB_API_URL,
    HTTP_HEADER_AUTHORIZATION,
    HTTP_NOT_FOUND,
    PROXY_URL_PLACEHOLDER,
} from "../constants";
import { t } from "../i18n";
import { coreRuntime } from "../runtime";
import { settle } from "../utils/settle";

export type HttpHeaders = Record<string, string>;

export type FoundCandidate<T> = {
    candidate: T;
    response: Response;
};

/**
 * What a request fetches data for. One subject is shared by every caller
 * of the same lookup, so dependencies and columns added later show up too.
 */
export type RequestSubject = {
    /** Name of the package.json whose dependencies the latest caller fetched; null outside the tables. */
    package: string | null;
    dependencies: Set<string>;
    columns: Set<string>;
};

/** A request as observers see it. `replay` sends it again with the current token. */
export type ObservedRequest = {
    method: string;
    url: string;
    subject: RequestSubject | null;
    replay: () => Promise<Response>;
};

/** Observer callbacks for one request's outcome. */
export type RequestHandle = {
    respond: (response: Response) => void;
    /** Called when no response arrives, or when its body breaks off after `respond`. */
    fail: (error: Error) => void;
    /** Called once the caller has read the whole body; never when it cancels or stops reading. */
    measure: (sizeBytes: number) => void;
};

export type RequestObserver = (request: ObservedRequest) => RequestHandle;

const requestObservers = new Set<RequestObserver>();

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
export function proxiedUrl(url: string, proxy: string = coreRuntime().settings().proxyUrl): string {
    if (!proxy) {
        return url;
    }
    if (!proxy.includes(PROXY_URL_PLACEHOLDER)) {
        return proxy + url;
    }
    return proxy.replace(PROXY_URL_PLACEHOLDER, encodeURIComponent(url));
}

/** Authorization header value carrying `token`. */
export function bearerAuthorization(token: string): string {
    return `Bearer ${token}`;
}

/** Registers `observer` for every request sent from now on. Returns the unsubscribe. */
export function observeRequests(observer: RequestObserver): () => void {
    requestObservers.add(observer);
    return () => {
        requestObservers.delete(observer);
    };
}

/**
 * Resends a request. The closure keeps no token: it holds `init` without
 * Authorization and adds the token current at replay time, so a purged
 * token is never sent again.
 */
function replayOf(
    url: string,
    init: RequestInit,
    subject: RequestSubject | null,
): () => Promise<Response> {
    const headers = new Headers(init.headers);
    const wasAuthorized = headers.has(HTTP_HEADER_AUTHORIZATION);
    headers.delete(HTTP_HEADER_AUTHORIZATION);
    const anonymousInit = { ...init, headers };
    return () => {
        const replayHeaders = new Headers(anonymousInit.headers);
        const token = coreRuntime().settings().githubToken;
        if (wasAuthorized && token) {
            replayHeaders.set(HTTP_HEADER_AUTHORIZATION, bearerAuthorization(token));
        }
        return fetchWithTimeout(url, { ...anonymousInit, headers: replayHeaders }, subject);
    };
}

/**
 * Same response, its body passed through a byte counter. Tells `handles`
 * the total once the caller has read it all, or the error when the body
 * breaks off (timeout, dropped connection). Reads only on demand, so size
 * limits that cancel the body still stop the download.
 */
function measuredResponse(response: Response, handles: readonly RequestHandle[]): Response {
    if (!response.body) {
        for (const handle of handles) {
            handle.measure(0);
        }
        return response;
    }
    const reader = response.body.getReader();
    let total = 0;
    const counted = new ReadableStream<Uint8Array>(
        {
            async pull(controller) {
                const result = await settle(() => reader.read());
                if (!result.ok) {
                    for (const handle of handles) {
                        handle.fail(result.error);
                    }
                    controller.error(result.error);
                    return;
                }
                if (result.value.done) {
                    for (const handle of handles) {
                        handle.measure(total);
                    }
                    controller.close();
                    return;
                }
                total += result.value.value.length;
                controller.enqueue(result.value.value);
            },
            cancel(reason) {
                return reader.cancel(reason);
            },
        },
        { highWaterMark: 0 },
    );
    return new Response(counted, response);
}

/**
 * `fetch` aborted after `fetchTimeoutMs` setting, so a stalled server can't
 * hang the app. Goes through the proxy unless it carries an Authorization
 * header: a token must only ever reach its own API host. Throws when such
 * a request targets any origin but the GitHub API. Observers see `url`,
 * not the proxied one, tagged with `subject`.
 */
export async function fetchWithTimeout(
    url: string,
    init: RequestInit = {},
    subject: RequestSubject | null = null,
): Promise<Response> {
    const isAuthorized = new Headers(init.headers).has(HTTP_HEADER_AUTHORIZATION);
    if (isAuthorized && new URL(url).origin !== GITHUB_API_URL) {
        throw new Error(t("errors.tokenHostBlocked"));
    }
    const request: ObservedRequest = {
        method: init.method ?? "GET",
        url,
        subject,
        replay: replayOf(url, init, subject),
    };
    const handles = [...requestObservers].map((observe) => observe(request));
    const result = await settle(() =>
        fetch(isAuthorized ? url : proxiedUrl(url), {
            ...init,
            signal: AbortSignal.timeout(coreRuntime().settings().fetchTimeoutMs),
        }),
    );
    if (!result.ok) {
        for (const handle of handles) {
            handle.fail(result.error);
        }
        throw result.error;
    }
    const response = measuredResponse(result.value, handles);
    for (const handle of handles) {
        handle.respond(response);
    }
    return response;
}

/**
 * Fetches a URL and parses the response as JSON. Returns `null` on 404
 * (resource doesn't exist). Throws HttpError on other non-2xx statuses
 * (rate limits, server errors) so callers don't cache transient failures,
 * and throws on network failure, timeout, or malformed JSON.
 */
export async function fetchJson<T>(
    url: string,
    init: RequestInit = {},
    subject: RequestSubject | null = null,
): Promise<T | null> {
    const response = await fetchWithTimeout(url, init, subject);
    if (response.status === HTTP_NOT_FOUND) {
        return null;
    }
    if (!response.ok) {
        throw new HttpError(response.status);
    }
    return response.json() as Promise<T>;
}

/** GETs a URL as text. Throws on non-2xx responses, network failure, and timeout. */
export async function fetchText(
    url: string,
    subject: RequestSubject | null = null,
): Promise<string> {
    const response = await fetchWithTimeout(url, {}, subject);
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
    subject: RequestSubject | null = null,
): Promise<FoundCandidate<T> | null> {
    for (const candidate of candidates) {
        const response = await fetchWithTimeout(toUrl(candidate), init, subject);
        if (response.ok) {
            return { candidate, response };
        }
        if (response.status !== HTTP_NOT_FOUND) {
            throw new HttpError(response.status);
        }
    }
    return null;
}
