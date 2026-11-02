import { describe, it, expect, vi } from "vitest";
import { fetchGithubRateLimit, findGithubReleaseTag, githubHeaders } from "../../../src/api/github";
import { githubToken } from "../../../src/settings";
import { jsonResponse, HTTP_STATUS, statusResponse } from "../../helpers/fetchMock";

describe("findGithubReleaseTag", () => {
    it("returns v-prefixed tag if present", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async (url: string) => jsonResponse({}, url.endsWith("/tags/v1.2.3"))),
        );

        expect(await findGithubReleaseTag("o", "r", "1.2.3")).toBe("v1.2.3");
    });

    it("falls back to bare version without v-prefixed tag", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async (url: string) => jsonResponse({}, url.endsWith("/tags/1.2.3"))),
        );

        expect(await findGithubReleaseTag("o", "r", "1.2.3")).toBe("1.2.3");
    });

    it("returns null without matching tag pattern", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => jsonResponse(null, false)),
        );

        expect(await findGithubReleaseTag("o", "r", "1.2.3")).toBeNull();
    });

    it("uses exact-match ref endpoint", async () => {
        const fetchMock = vi.fn(async () => jsonResponse({}, true));
        vi.stubGlobal("fetch", fetchMock);

        await findGithubReleaseTag("o", "r", "1.2.3");

        expect(fetchMock.mock.calls[0][0]).toBe(
            "https://api.github.com/repos/o/r/git/ref/tags/v1.2.3",
        );
    });

    it("throws on rate limit instead of reporting missing tag", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => statusResponse(HTTP_STATUS.forbidden)),
        );

        await expect(findGithubReleaseTag("o", "r", "1.2.3")).rejects.toThrow("403");
    });
});

describe("githubHeaders", () => {
    it("adds bearer token if given", () => {
        expect(githubHeaders("abc").Authorization).toBe("Bearer abc");
    });

    it("defaults to in-memory token", () => {
        githubToken.value = "mem";

        expect(githubHeaders().Authorization).toBe("Bearer mem");
        githubToken.value = undefined;
    });

    it("omits Authorization without token", () => {
        expect(githubHeaders("")).not.toHaveProperty("Authorization");
    });
});

describe("fetchGithubRateLimit", () => {
    it("returns remaining and limit, sends token", async () => {
        const fetchMock = vi.fn(async () =>
            jsonResponse({ rate: { limit: 5000, remaining: 4999, used: 1 } }),
        );
        vi.stubGlobal("fetch", fetchMock);

        expect(await fetchGithubRateLimit("abc")).toEqual({ limit: 5000, remaining: 4999 });
        expect(fetchMock).toHaveBeenCalledWith(
            "https://api.github.com/rate_limit",
            expect.objectContaining({
                headers: expect.objectContaining({ Authorization: "Bearer abc" }),
            }),
        );
    });

    it("returns null on 401", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => statusResponse(HTTP_STATUS.unauthorized)),
        );

        expect(await fetchGithubRateLimit("bad")).toBeNull();
    });

    it("throws on 500", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => statusResponse(HTTP_STATUS.serverError)),
        );

        await expect(fetchGithubRateLimit("abc")).rejects.toThrow("500");
    });
});
