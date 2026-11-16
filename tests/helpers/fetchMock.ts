import { expect, vi } from "vitest";
import type { Mock } from "vitest";
import { BYTES_PER_MB } from "../../src/core/constants";

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

const BYTE_LETTER_A = 0x61;

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

/** Stubs global `fetch` with a mock answering every request with `answer()`. Returns the mock. */
export function stubFetchWith(answer: () => unknown) {
    const fetchMock = vi.fn(async () => answer());
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
}

/** Stubs global `fetch` with a `streamedResponse(status)`. Returns its `cancelSource`. */
export function stubFetchStreamed(status: number) {
    const { response, cancelSource } = streamedResponse(status);
    stubFetchWith(() => response);
    return cancelSource;
}

/**
 * Stubs global `fetch` with a 200 response streaming `totalBytes` bytes
 * (Infinity = endless) in chunks of at most 1 MB. Returns its `cancelSource`.
 */
export function stubFetchSized(totalBytes: number) {
    const cancelSource = vi.fn();
    let sentBytes = 0;
    const body = new ReadableStream<Uint8Array>({
        pull(controller) {
            if (sentBytes >= totalBytes) {
                controller.close();
                return;
            }
            const size = Math.min(BYTES_PER_MB, totalBytes - sentBytes);
            controller.enqueue(new Uint8Array(size).fill(BYTE_LETTER_A));
            sentBytes += size;
        },
        cancel: cancelSource,
    });
    stubFetchWith(() => new Response(body));
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
