import { vi } from "vitest";

export const HTTP_STATUS = {
    ok: 200,
    forbidden: 403,
    notFound: 404,
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
    return { ok: true, status: HTTP_STATUS.ok, arrayBuffer: async () => body };
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

export function countFetchCalls(fetchMock: ReturnType<typeof vi.fn>, pattern: string): number {
    return fetchMock.mock.calls.filter(([url]: [string]) => url.includes(pattern)).length;
}
