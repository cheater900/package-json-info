import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchWithTimeout, findFirstFound, proxiedUrl } from "../../../src/api/http";
import { settings } from "../../../src/settings";
import { jsonResponse } from "../../helpers/fetchMock";
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

        await fetchWithTimeout("https://a.test/x", { headers: { Authorization: "Bearer t" } });

        expect(fetchMock).toHaveBeenCalledWith("https://a.test/x", expect.anything());
    });
});
