import { describe, it, expect, vi } from "vitest";
import {
    fetchGithubRateLimit,
    fetchGithubTree,
    findGithubReleaseTag,
    githubHeaders,
} from "../../../../src/core/api/github";
import { GITHUB_RATE_LIMIT_URL } from "../../../../src/core/constants";
import { coreSettings } from "../../../helpers/core";
import {
    jsonResponse,
    HTTP_STATUS,
    statusResponse,
    stubFetchStreamed,
    expectBodyCancelled,
} from "../../../helpers/fetchMock";
import { githubRateLimit, githubRateLimitBody } from "../../../fixtures/github";

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
        const fetchMock = vi.fn(async (_url: string) => jsonResponse({}, true));
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
        coreSettings.githubToken = "mem";

        expect(githubHeaders().Authorization).toBe("Bearer mem");
    });

    it("omits Authorization without token", () => {
        expect(githubHeaders("")).not.toHaveProperty("Authorization");
    });
});

describe("fetchGithubRateLimit", () => {
    it("returns remaining and limit, sends token", async () => {
        const fetchMock = vi.fn(async () => jsonResponse(githubRateLimitBody));
        vi.stubGlobal("fetch", fetchMock);

        expect(await fetchGithubRateLimit("abc")).toEqual(githubRateLimit);
        expect(fetchMock).toHaveBeenCalledWith(
            GITHUB_RATE_LIMIT_URL,
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

    it.each([
        ["401", HTTP_STATUS.unauthorized],
        ["500", HTTP_STATUS.serverError],
    ])("cancels unread body on %s", async (_label, status) => {
        const cancelSource = stubFetchStreamed(status);

        await fetchGithubRateLimit("abc").catch(() => null);

        await expectBodyCancelled(cancelSource);
    });
});

describe("fetchGithubTree", () => {
    it("returns entries and truncated flag, encodes ref, sends token", async () => {
        const entries = [{ path: "a.js", type: "blob", size: 3 }];
        const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
            jsonResponse({ tree: entries, truncated: true }),
        );
        vi.stubGlobal("fetch", fetchMock);
        coreSettings.githubToken = "mem";

        expect(await fetchGithubTree("o", "r", "feat/x")).toEqual({ entries, truncated: true });
        expect(fetchMock).toHaveBeenCalledWith(
            "https://api.github.com/repos/o/r/git/trees/feat%2Fx?recursive=1",
            expect.objectContaining({
                headers: expect.objectContaining({ Authorization: "Bearer mem" }),
            }),
        );
    });

    it("returns no entries, untruncated, for answer without tree", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => jsonResponse({})),
        );

        expect(await fetchGithubTree("o", "r", "main")).toEqual({ entries: [], truncated: false });
    });

    it("throws with status on 403", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => statusResponse(HTTP_STATUS.forbidden)),
        );

        await expect(fetchGithubTree("o", "r", "main")).rejects.toThrow("403");
    });

    it("cancels unread body on failure", async () => {
        const cancelSource = stubFetchStreamed(HTTP_STATUS.forbidden);

        await fetchGithubTree("o", "r", "main").catch(() => null);

        await expectBodyCancelled(cancelSource);
    });

    it("rejects on malformed JSON body", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => ({
                ok: true,
                status: HTTP_STATUS.ok,
                json: async () => JSON.parse("<html>"),
            })),
        );

        await expect(fetchGithubTree("o", "r", "main")).rejects.toThrow(SyntaxError);
    });
});
