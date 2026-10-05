import { vi } from "vitest";

export const HTTP_OK = 200;
export const HTTP_NOT_FOUND = 404;

/** Minimal `Response` stand-in: `ok` true -> 200, false -> 404. */
export function jsonResponse(body: unknown, ok = true) {
    return {
        ok,
        status: ok ? HTTP_OK : HTTP_NOT_FOUND,
        json: async () => body,
        text: async () => JSON.stringify(body),
    };
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
