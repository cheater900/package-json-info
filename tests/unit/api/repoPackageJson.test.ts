import { describe, it, expect, vi, beforeEach } from "vitest";
import {
    fetchPackageJsonFromRepo,
    SUPPORTED_REPO_HOSTS,
    isRepoHostUrl,
} from "../../../src/utils/repoPackageJson";

function jsonResponse(body: unknown, ok = true) {
    return { ok, status: ok ? 200 : 404, text: async () => JSON.stringify(body) };
}

beforeEach(() => {
    vi.unstubAllGlobals();
});

describe("fetchPackageJsonFromRepo", () => {
    it("fetches from GitHub's raw content URL on the main branch", async () => {
        const fetchMock = vi.fn(async (url: string) => {
            expect(url).toBe("https://raw.githubusercontent.com/owner/repo/main/package.json");
            return jsonResponse({ name: "repo" });
        });
        vi.stubGlobal("fetch", fetchMock);

        const content = await fetchPackageJsonFromRepo("https://github.com/owner/repo");

        expect(JSON.parse(content!)).toEqual({ name: "repo" });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("falls back to the master branch when main has no package.json", async () => {
        const requestedUrls: string[] = [];
        vi.stubGlobal(
            "fetch",
            vi.fn(async (url: string) => {
                requestedUrls.push(url);
                return url.includes("/master/")
                    ? jsonResponse({ name: "repo" })
                    : jsonResponse(null, false);
            }),
        );

        const content = await fetchPackageJsonFromRepo("https://github.com/owner/repo");

        expect(JSON.parse(content!)).toEqual({ name: "repo" });
        expect(requestedUrls).toEqual([
            "https://raw.githubusercontent.com/owner/repo/main/package.json",
            "https://raw.githubusercontent.com/owner/repo/master/package.json",
        ]);
    });

    it("returns null when neither branch has a package.json", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => jsonResponse(null, false)),
        );

        const content = await fetchPackageJsonFromRepo("https://github.com/owner/repo");

        expect(content).toBeNull();
    });

    it("builds GitLab's raw file URL", async () => {
        const fetchMock = vi.fn(async (url: string) => {
            expect(url).toBe("https://gitlab.com/owner/repo/-/raw/main/package.json");
            return jsonResponse({ name: "repo" });
        });
        vi.stubGlobal("fetch", fetchMock);

        await fetchPackageJsonFromRepo("https://gitlab.com/owner/repo");

        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("builds Codeberg's raw file URL", async () => {
        const fetchMock = vi.fn(async (url: string) => {
            expect(url).toBe("https://codeberg.org/owner/repo/raw/branch/main/package.json");
            return jsonResponse({ name: "repo" });
        });
        vi.stubGlobal("fetch", fetchMock);

        await fetchPackageJsonFromRepo("https://codeberg.org/owner/repo");

        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("accepts a URL with a trailing path", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => jsonResponse({ name: "repo" })),
        );

        const content = await fetchPackageJsonFromRepo("https://github.com/owner/repo/tree/main");

        expect(JSON.parse(content!)).toEqual({ name: "repo" });
    });

    it("throws a descriptive error for an unsupported host", async () => {
        vi.stubGlobal("fetch", vi.fn());

        await expect(fetchPackageJsonFromRepo("https://bitbucket.org/owner/repo")).rejects.toThrow(
            /Unsupported git host "bitbucket\.org"/,
        );
    });

    it("throws a descriptive error for a malformed URL", async () => {
        vi.stubGlobal("fetch", vi.fn());

        await expect(fetchPackageJsonFromRepo("not a url")).rejects.toThrow(
            /Invalid repository URL/,
        );
    });

    it("exports every host it claims to support", () => {
        expect(SUPPORTED_REPO_HOSTS).toEqual(
            expect.arrayContaining(["github.com", "gitlab.com", "codeberg.org"]),
        );
    });
});

describe("isRepoHostUrl", () => {
    it("is true for a URL on any supported repo host", () => {
        expect(isRepoHostUrl("https://github.com/owner/repo")).toBe(true);
        expect(isRepoHostUrl("https://gitlab.com/owner/repo")).toBe(true);
        expect(isRepoHostUrl("https://codeberg.org/owner/repo")).toBe(true);
    });

    it("is false for a URL on any other host", () => {
        expect(isRepoHostUrl("https://example.com/package.json")).toBe(false);
        expect(
            isRepoHostUrl("https://raw.githubusercontent.com/owner/repo/main/package.json"),
        ).toBe(false);
    });

    it("is false, not throwing, for an unparseable URL", () => {
        expect(isRepoHostUrl("not a url")).toBe(false);
        expect(isRepoHostUrl("")).toBe(false);
    });
});
