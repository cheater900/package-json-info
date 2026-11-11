import { describe, it, expect, vi } from "vitest";
import { fetchPackageJsonFromRepo } from "../../../src/api/repoPackageJson";
import { HTTP_STATUS, jsonResponse, statusResponse } from "../../helpers/fetchMock";

describe("fetchPackageJsonFromRepo", () => {
    it("fetches from GitHub raw content URL on main branch", async () => {
        const fetchMock = vi.fn(async (url: string) => {
            expect(url).toBe("https://raw.githubusercontent.com/owner/repo/main/package.json");
            return jsonResponse({ name: "repo" });
        });
        vi.stubGlobal("fetch", fetchMock);

        const content = await fetchPackageJsonFromRepo("https://github.com/owner/repo");

        expect(JSON.parse(content!.text)).toEqual({ name: "repo" });
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

        expect(JSON.parse(content!.text)).toEqual({ name: "repo" });
        expect(content!.branch).toBe("master");
        expect(content!.slug).toEqual({ host: "github.com", owner: "owner", repo: "repo" });
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

        expect(JSON.parse(content!.text)).toEqual({ name: "repo" });
    });

    it.each([
        "https://github.com/owner/repo.git",
        "https://GitHub.com/owner/repo",
        "https://github.com/owner/repo?tab=readme",
        "https://github.com/owner/repo#readme",
    ])("resolves %s to raw package.json", async (url) => {
        const fetchMock = vi.fn(async (_url: string) => jsonResponse({ name: "repo" }));
        vi.stubGlobal("fetch", fetchMock);

        await fetchPackageJsonFromRepo(url);

        expect(fetchMock.mock.calls[0][0]).toBe(
            "https://raw.githubusercontent.com/owner/repo/main/package.json",
        );
    });

    it("keeps .git inside repo name", async () => {
        const fetchMock = vi.fn(async (_url: string) => jsonResponse({ name: "repo" }));
        vi.stubGlobal("fetch", fetchMock);

        await fetchPackageJsonFromRepo("https://github.com/owner/my.git.repo");

        expect(fetchMock.mock.calls[0][0]).toBe(
            "https://raw.githubusercontent.com/owner/my.git.repo/main/package.json",
        );
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

    it("throws invalid-URL error for URL without repo segment", async () => {
        vi.stubGlobal("fetch", vi.fn());

        await expect(fetchPackageJsonFromRepo("https://github.com/owner")).rejects.toThrow(
            /Invalid repository URL/,
        );
    });

    it.each([
        "https://github.com/trusted?next=/github.com/evil/repo",
        "https://github.com/trusted#/github.com/evil/repo",
        "https://gitlab.com/x/github.com/evil/repo",
    ])("rejects slug outside URL's own host path: %s", async (url) => {
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);

        await expect(fetchPackageJsonFromRepo(url)).rejects.toThrow(/Invalid repository URL/);
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

describe("fetchPackageJsonFromRepo failures", () => {
    it("throws on rate limit instead of trying next branch", async () => {
        const fetchMock = vi.fn(async () => statusResponse(HTTP_STATUS.tooManyRequests));
        vi.stubGlobal("fetch", fetchMock);

        await expect(fetchPackageJsonFromRepo("https://github.com/o/r")).rejects.toThrow("429");
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});
