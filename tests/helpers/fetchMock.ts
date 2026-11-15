import { expect, vi } from "vitest";
import type { Mock } from "vitest";

export const HTTP_STATUS = {
    ok: 200,
    unauthorized: 401,
    forbidden: 403,
    notFound: 404,
    conflict: 409,
    tooManyRequests: 429,
    serverError: 500,
    serviceUnavailable: 503,
} as const;

/** Minimal `Response` stand-in: `ok` true -> 200, false -> 404. */
export function jsonResponse(body: unknown, ok = true) {
    return {
        ok,
        status: ok ? HTTP_STATUS.ok : HTTP_STATUS.notFound,
        json: async () => body,
        text: async () => JSON.stringify(body),
    };
}

/** Failed response with the given non-2xx status and an empty body. */
export function statusResponse(status: number) {
    return { ok: false, status, json: async () => ({}), text: async () => "" };
}

/** 200 response carrying raw text, as a raw file host returns it. */
export function textResponse(text: string) {
    return { ok: true, status: HTTP_STATUS.ok, text: async () => text };
}

/** 200 response carrying binary data, such as a tarball download. */
export function binaryResponse(body: ArrayBuffer) {
    return { ok: true, status: HTTP_STATUS.ok, body: new Response(body).body };
}

/** Real `Response` with a streamed body; `cancelSource` fires when the body gets cancelled. */
export function streamedResponse(status: number) {
    const cancelSource = vi.fn();
    const body = new ReadableStream<Uint8Array>({ cancel: cancelSource });
    return { response: new Response(body, { status }), cancelSource };
}

/** Stubs global `fetch` with a `streamedResponse(status)`. Returns its `cancelSource`. */
export function stubFetchStreamed(status: number) {
    const { response, cancelSource } = streamedResponse(status);
    vi.stubGlobal(
        "fetch",
        vi.fn(async () => response),
    );
    return cancelSource;
}

/** Waits for the body cancel; `discardBody` fires it without awaiting. */
export async function expectBodyCancelled(cancelSource: Mock) {
    await vi.waitFor(() => {
        expect(cancelSource).toHaveBeenCalled();
    });
}

/** Stubs global `fetch` with requests that never settle, to hold a load in flight. */
export function stubFetchPending() {
    vi.stubGlobal(
        "fetch",
        vi.fn(() => new Promise(() => {})),
    );
}

/** Fetch mock answering the first `handlers` key contained in the URL; 404 otherwise. */
export function mockFetchByUrl(handlers: Record<string, unknown>) {
    return vi.fn(async (url: string) => {
        for (const [pattern, body] of Object.entries(handlers)) {
            if (url.includes(pattern)) {
                return jsonResponse(body);
            }
        }
        return jsonResponse(null, false);
    });
}

/** Stubs global `fetch` with mockFetchByUrl(handlers) and returns the mock. */
export function stubFetchByUrl(handlers: Record<string, unknown>) {
    const fetchMock = mockFetchByUrl(handlers);
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
}

/** Calls of `fetchMock` whose URL contains `pattern`, as `[url, init]` pairs. */
export function fetchCallsTo(fetchMock: ReturnType<typeof vi.fn>, pattern: string) {
    return fetchMock.mock.calls.filter(([url]: string[]) => url.includes(pattern));
}

export function countFetchCalls(fetchMock: ReturnType<typeof vi.fn>, pattern: string): number {
    return fetchCallsTo(fetchMock, pattern).length;
}
