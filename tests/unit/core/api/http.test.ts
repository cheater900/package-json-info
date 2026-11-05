import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import {
    fetchJson,
    fetchWithTimeout,
    findFirstFound,
    HttpError,
    observeRequests,
    proxiedUrl,
} from "../../../../src/core/api/http";
import type { ObservedRequest } from "../../../../src/core/api/http";
import { githubToken, settings } from "../../../../src/app/settings";
import { settle } from "../../../../src/core/utils/settle";
import { HTTP_STATUS, jsonResponse, statusResponse } from "../../../helpers/fetchMock";
import { resetSettings } from "../../../helpers/settings";
import { subjectOf } from "../../../helpers/requests";

afterEach(resetSettings);

describe("findFirstFound", () => {
    it("skips 404 candidates, returns first found", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async (url: string) => jsonResponse({}, url.endsWith("/b"))),
        );

        const found = await findFirstFound(["a", "b", "c"], (c) => `https://x/${c}`);

        expect(found?.candidate).toBe("b");
    });

    it("returns null when every candidate 404s", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => jsonResponse(null, false)),
        );

        expect(await findFirstFound(["a"], (c) => c)).toBeNull();
    });

    it("throws on non-404 failure without trying next candidate", async () => {
        const fetchMock = vi.fn(async () => statusResponse(HTTP_STATUS.serverError));
        vi.stubGlobal("fetch", fetchMock);

        await expect(findFirstFound(["a", "b"], (c) => `https://x/${c}`)).rejects.toThrow("500");
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});

describe("fetchJson", () => {
    it("returns null on 404", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => jsonResponse(null, false)),
        );

        expect(await fetchJson("https://a.test/x")).toBeNull();
    });

    it("throws HttpError with status on other failure", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => statusResponse(HTTP_STATUS.tooManyRequests)),
        );

        const result = await settle(() => fetchJson("https://a.test/x"));

        expect(result.ok).toBe(false);
        expect(!result.ok && result.error).toBeInstanceOf(HttpError);
        expect(!result.ok && result.error).toMatchObject({
            status: HTTP_STATUS.tooManyRequests,
            message: "Request failed with status 429",
        });
    });
});

describe("proxiedUrl", () => {
    it("returns url unchanged for empty proxy", () => {
        expect(proxiedUrl("https://a.test/x", "")).toBe("https://a.test/x");
    });

    it("prefixes url when proxy has no placeholder", () => {
        expect(proxiedUrl("https://a.test/x", "https://p.test/")).toBe(
            "https://p.test/https://a.test/x",
        );
    });

    it("puts encoded url at {url} placeholder", () => {
        expect(proxiedUrl("https://a.test/x?y=1", "https://p.test/?u={url}")).toBe(
            "https://p.test/?u=https%3A%2F%2Fa.test%2Fx%3Fy%3D1",
        );
    });
});

describe("fetchWithTimeout", () => {
    it("routes request through proxy", async () => {
        const fetchMock = vi.fn(async () => jsonResponse({}));
        vi.stubGlobal("fetch", fetchMock);
        settings.proxyUrl = "https://p.test/";

        await fetchWithTimeout("https://a.test/x");

        expect(fetchMock).toHaveBeenCalledWith(
            "https://p.test/https://a.test/x",
            expect.anything(),
        );
    });

    it("bypasses proxy for authorized request", async () => {
        const fetchMock = vi.fn(async () => jsonResponse({}));
        vi.stubGlobal("fetch", fetchMock);
        settings.proxyUrl = "https://p.test/";

        await fetchWithTimeout("https://api.github.com/x", {
            headers: { Authorization: "Bearer t" },
        });

        expect(fetchMock).toHaveBeenCalledWith("https://api.github.com/x", expect.anything());
    });

    it("aborts request after settings.fetchTimeoutMs", async () => {
        const fetchMock = vi.fn(
            (_url: string, init: RequestInit) =>
                new Promise((_resolve, reject) => {
                    init.signal!.addEventListener("abort", () => reject(init.signal!.reason));
                }),
        );
        vi.stubGlobal("fetch", fetchMock);
        settings.fetchTimeoutMs = 5;

        await expect(fetchWithTimeout("https://a.test/x")).rejects.toThrow(
            expect.objectContaining({ name: "TimeoutError" }),
        );
    });

    it("keeps caller method and body", async () => {
        const fetchMock = vi.fn(async () => jsonResponse({}));
        vi.stubGlobal("fetch", fetchMock);

        await fetchWithTimeout("https://a.test/x", { method: "POST", body: "{}" });

        expect(fetchMock).toHaveBeenCalledWith(
            "https://a.test/x",
            expect.objectContaining({ method: "POST", body: "{}" }),
        );
    });

    it.each(["https://a.test/x", "https://api.github.com.a.test/x", "http://api.github.com/x"])(
        "throws for authorized request to %s",
        async (url) => {
            const fetchMock = vi.fn(async () => jsonResponse({}));
            vi.stubGlobal("fetch", fetchMock);

            await expect(
                fetchWithTimeout(url, { headers: { authorization: "Bearer t" } }),
            ).rejects.toThrow("GitHub token");
            expect(fetchMock).not.toHaveBeenCalled();
        },
    );
});

describe("observeRequests", () => {
    const SUBJECT = subjectOf(["left-pad"], ["gitStars"]);
    let requests: ObservedRequest[] = [];
    let handle = { respond: vi.fn(), fail: vi.fn(), measure: vi.fn() };
    let stopObserving = () => {};

    beforeEach(() => {
        requests = [];
        handle = { respond: vi.fn(), fail: vi.fn(), measure: vi.fn() };
        stopObserving = observeRequests((request) => {
            requests.push(request);
            return handle;
        });
    });

    afterEach(() => {
        stopObserving();
    });

    it("passes method, url, subject to observer", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => jsonResponse({})),
        );

        await fetchWithTimeout("https://a.test/x", { method: "POST" }, SUBJECT);

        expect(requests).toHaveLength(1);
        expect(requests[0]).toMatchObject({
            method: "POST",
            url: "https://a.test/x",
            subject: SUBJECT,
        });
    });

    it("defaults method to GET, subject to null", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => jsonResponse({})),
        );

        await fetchWithTimeout("https://a.test/x");

        expect(requests[0]).toMatchObject({ method: "GET", subject: null });
    });

    it("calls respond with returned response", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => jsonResponse({})),
        );

        const response = await fetchWithTimeout("https://a.test/x");

        expect(handle.respond).toHaveBeenCalledWith(response);
        expect(handle.fail).not.toHaveBeenCalled();
    });

    it("calls measure with body size once caller reads body", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response("hello")),
        );

        const response = await fetchWithTimeout("https://a.test/x");

        expect(handle.measure).not.toHaveBeenCalled();
        expect(await response.text()).toBe("hello");
        expect(handle.measure).toHaveBeenCalledWith(5);
    });

    it("forwards body cancel to source, skips measure", async () => {
        const cancelSource = vi.fn();
        const source = new ReadableStream<Uint8Array>({
            pull(controller) {
                controller.enqueue(new Uint8Array(1024));
            },
            cancel: cancelSource,
        });
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response(source)),
        );

        const response = await fetchWithTimeout("https://a.test/x");
        const reader = response.body!.getReader();
        await reader.read();
        await reader.cancel();

        await vi.waitFor(() => {
            expect(cancelSource).toHaveBeenCalled();
        });
        expect(handle.measure).not.toHaveBeenCalled();
    });

    it("calls fail when body breaks off mid-read", async () => {
        const error = new Error("connection reset");
        let pulls = 0;
        const source = new ReadableStream<Uint8Array>({
            pull(controller) {
                pulls++;
                if (pulls > 1) {
                    controller.error(error);
                    return;
                }
                controller.enqueue(new Uint8Array(8));
            },
        });
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response(source)),
        );

        const response = await fetchWithTimeout("https://a.test/x");

        await expect(response.text()).rejects.toThrow("connection reset");
        expect(handle.respond).toHaveBeenCalled();
        expect(handle.fail).toHaveBeenCalledWith(error);
        expect(handle.measure).not.toHaveBeenCalled();
    });

    it("calls fail with error on network failure", async () => {
        const error = new Error("network down");
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => {
                throw error;
            }),
        );

        await expect(fetchWithTimeout("https://a.test/x")).rejects.toThrow("network down");
        expect(handle.fail).toHaveBeenCalledWith(error);
        expect(handle.respond).not.toHaveBeenCalled();
    });

    it("reports target url, not proxied one", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => jsonResponse({})),
        );
        settings.proxyUrl = "https://p.test/";

        await fetchWithTimeout("https://a.test/x");

        expect(requests[0].url).toBe("https://a.test/x");
    });

    it("receives subject from fetchJson", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => jsonResponse({})),
        );

        await fetchJson("https://a.test/x", {}, SUBJECT);

        expect(requests[0].subject).toBe(SUBJECT);
    });

    it("receives subject from findFirstFound for every candidate", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async (url: string) => jsonResponse({}, url.endsWith("/b"))),
        );

        await findFirstFound(["a", "b"], (c) => `https://x/${c}`, {}, SUBJECT);

        expect(requests.map((r) => r.subject)).toEqual([SUBJECT, SUBJECT]);
    });

    it("calls no observer when token host guard throws", async () => {
        await expect(
            fetchWithTimeout("https://a.test/x", { headers: { Authorization: "Bearer t" } }),
        ).rejects.toThrow("GitHub token");
        expect(requests).toHaveLength(0);
    });

    it("stops notifying after unsubscribe", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => jsonResponse({})),
        );
        stopObserving();

        await fetchWithTimeout("https://a.test/x");

        expect(requests).toHaveLength(0);
    });

    describe("replay", () => {
        const URL_GITHUB = "https://api.github.com/x";

        async function sendAuthorized(fetchMock: ReturnType<typeof vi.fn>) {
            vi.stubGlobal("fetch", fetchMock);
            githubToken.value = "old";
            await fetchWithTimeout(URL_GITHUB, {
                headers: { Accept: "json", Authorization: "Bearer old" },
            });
            fetchMock.mockClear();
        }

        function replayedHeaders(fetchMock: ReturnType<typeof vi.fn>): Headers {
            const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
            return new Headers(init.headers);
        }

        it("sends no Authorization once token purged", async () => {
            const fetchMock = vi.fn(async () => jsonResponse({}));
            await sendAuthorized(fetchMock);
            githubToken.value = undefined;

            await requests[0].replay();

            expect(replayedHeaders(fetchMock).has("Authorization")).toBe(false);
            expect(replayedHeaders(fetchMock).get("Accept")).toBe("json");
        });

        it("sends current token", async () => {
            const fetchMock = vi.fn(async () => jsonResponse({}));
            await sendAuthorized(fetchMock);
            githubToken.value = "new";

            await requests[0].replay();

            expect(replayedHeaders(fetchMock).get("Authorization")).toBe("Bearer new");
        });

        it("adds no token to originally anonymous request", async () => {
            const fetchMock = vi.fn(async () => jsonResponse({}));
            vi.stubGlobal("fetch", fetchMock);
            await fetchWithTimeout(URL_GITHUB);
            githubToken.value = "new";
            fetchMock.mockClear();

            await requests[0].replay();

            expect(replayedHeaders(fetchMock).has("Authorization")).toBe(false);
        });

        it("reports replayed request with same subject", async () => {
            vi.stubGlobal(
                "fetch",
                vi.fn(async () => jsonResponse({})),
            );
            await fetchWithTimeout("https://a.test/x", {}, SUBJECT);

            await requests[0].replay();

            expect(requests).toHaveLength(2);
            expect(requests[1]).toMatchObject({ url: "https://a.test/x", subject: SUBJECT });
        });
    });
});
