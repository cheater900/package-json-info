import { describe, it, expect, vi, beforeEach } from "vitest";
import { findGithubReleaseTag, githubHeaders } from "../../../src/api/github";
import { jsonResponse } from "../../helpers/fetchMock";

const HTTP_FORBIDDEN = 403;

beforeEach(() => {
    vi.unstubAllGlobals();
});

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

    it("throws on rate limit instead of reporting missing tag", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => ({ ok: false, status: HTTP_FORBIDDEN })),
        );

        await expect(findGithubReleaseTag("o", "r", "1.2.3")).rejects.toThrow("403");
    });
});

describe("githubHeaders", () => {
    it("adds bearer token if given", () => {
        expect(githubHeaders("abc").Authorization).toBe("Bearer abc");
    });

    it("omits Authorization without token", () => {
        expect(githubHeaders("")).not.toHaveProperty("Authorization");
    });
});
