import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchPackageJsonFromRepo, isRepoHostUrl } from "../../../src/api/repoPackageJson";
import { SUPPORTED_REPO_HOSTS } from "../../../src/constants";
import { jsonResponse } from "../../helpers/fetchMock";

beforeEach(() => {
    vi.unstubAllGlobals();
});

describe("fetchPackageJsonFromRepo", () => {
    it("fetches from GitHub raw content URL on main branch", async () => {
        const fetchMock = vi.fn(async (url: string) => {
            expect(url).toBe("https://raw.githubusercontent.com/owner/repo/main/package.json");
            return jsonResponse({ name: "repo" });
        });
        vi.stubGlobal("fetch", fetchMock);

        const content = await fetchPackageJsonFromRepo("https://github.com/owner/repo");

        expect(JSON.parse(content!)).toEqual({ name: "repo" });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("falls back to master branch without package.json on main", async () => {
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

    it("returns null without package.json on either branch", async () => {
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

    it("accepts URL with trailing path", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => jsonResponse({ name: "repo" })),
        );

        const content = await fetchPackageJsonFromRepo("https://github.com/owner/repo/tree/main");

        expect(JSON.parse(content!)).toEqual({ name: "repo" });
    });

    it("throws descriptive error for unsupported host", async () => {
        vi.stubGlobal("fetch", vi.fn());

        await expect(fetchPackageJsonFromRepo("https://bitbucket.org/owner/repo")).rejects.toThrow(
            /Unsupported git host "bitbucket\.org"/,
        );
    });

    it("throws descriptive error for malformed URL", async () => {
        vi.stubGlobal("fetch", vi.fn());

        await expect(fetchPackageJsonFromRepo("not a url")).rejects.toThrow(
            /Invalid repository URL/,
        );
    });

    it("exports every supported host", () => {
        expect(SUPPORTED_REPO_HOSTS).toEqual(
            expect.arrayContaining(["github.com", "gitlab.com", "codeberg.org"]),
        );
    });
});

describe("isRepoHostUrl", () => {
    it("is true for URL on supported repo host", () => {
        expect(isRepoHostUrl("https://github.com/owner/repo")).toBe(true);
        expect(isRepoHostUrl("https://gitlab.com/owner/repo")).toBe(true);
        expect(isRepoHostUrl("https://codeberg.org/owner/repo")).toBe(true);
    });

    it("is false for URL on other host", () => {
        expect(isRepoHostUrl("https://example.com/package.json")).toBe(false);
        expect(
            isRepoHostUrl("https://raw.githubusercontent.com/owner/repo/main/package.json"),
        ).toBe(false);
    });

    it("is false for unparseable URL, no throw", () => {
        expect(isRepoHostUrl("not a url")).toBe(false);
        expect(isRepoHostUrl("")).toBe(false);
    });
});
