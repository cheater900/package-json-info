import { describe, it, expect, vi, afterEach } from "vitest";
import {
    fetchJson,
    fetchWithTimeout,
    findFirstFound,
    HttpError,
    proxiedUrl,
} from "../../../src/api/http";
import { settings } from "../../../src/settings";
import { settle } from "../../../src/utils/settle";
import { HTTP_STATUS, jsonResponse, statusResponse } from "../../helpers/fetchMock";
import { resetSettings } from "../../helpers/settings";

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
        (url) => {
            const fetchMock = vi.fn(async () => jsonResponse({}));
            vi.stubGlobal("fetch", fetchMock);

            expect(() => fetchWithTimeout(url, { headers: { authorization: "Bearer t" } })).toThrow(
                "GitHub token",
            );
            expect(fetchMock).not.toHaveBeenCalled();
        },
    );
});
