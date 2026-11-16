import { describe, it, expect, vi } from "vitest";
import { fetchPackageJsonFromRepo } from "../../../../src/core/api/repoPackageJson";
import {
    HTTP_STATUS,
    jsonResponse,
    statusResponse,
    stubFetchSized,
    stubFetchWith,
} from "../../../helpers/fetchMock";

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
        stubFetchWith(() => jsonResponse(null, false));

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

describe("fetchPackageJsonFromRepo GitHub blob and tree URLs", () => {
    const RAW = "https://raw.githubusercontent.com/o/r";

    function stubFile() {
        const fetchMock = vi.fn(async (_url: string) => jsonResponse({ name: "file" }));
        vi.stubGlobal("fetch", fetchMock);
        return fetchMock;
    }

    it.each([
        ["https://github.com/o/r/blob/v2/package.json", `${RAW}/v2/package.json`, "v2"],
        ["https://github.com/o/r/tree/v2", `${RAW}/v2/package.json`, "v2"],
        ["https://github.com/o/r/tree/v2/", `${RAW}/v2/package.json`, "v2"],
        ["https://github.com/o/r/blob/feat/x/package.json", `${RAW}/feat/x/package.json`, null],
        [
            "https://github.com/o/r/blob/main/packages/a/package.json",
            `${RAW}/main/packages/a/package.json`,
            null,
        ],
        [
            "https://github.com/o/r/tree/main/packages/a",
            `${RAW}/main/packages/a/package.json`,
            null,
        ],
        [
            "https://github.com/o/r/blob/main/my%20dir/package.json",
            `${RAW}/main/my%20dir/package.json`,
            null,
        ],
        ["https://github.com/o/r/blob/v2/package.json?plain=1#L3", `${RAW}/v2/package.json`, "v2"],
    ])("fetches %s directly", async (url, rawUrl, branch) => {
        const fetchMock = stubFile();

        const content = await fetchPackageJsonFromRepo(url);

        expect(fetchMock.mock.calls.map(([called]) => called)).toEqual([rawUrl]);
        expect(content).toEqual({
            text: JSON.stringify({ name: "file" }),
            slug: { host: "github.com", owner: "o", repo: "r" },
            branch,
        });
    });

    it("returns null for missing file without probing branches", async () => {
        const fetchMock = vi.fn(async () => statusResponse(HTTP_STATUS.notFound));
        vi.stubGlobal("fetch", fetchMock);

        const content = await fetchPackageJsonFromRepo("https://github.com/o/r/tree/gone");

        expect(content).toBeNull();
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it.each([
        "https://github.com/o/r/blob/main/../package.json",
        "https://github.com/o/r/blob/main/%2e%2e/package.json",
        "https://github.com/o/r/blob/main/x%2F..%2F..%2F..%2F..%2Fevil%2Fr%2Fmain%2Fpackage.json",
        "https://github.com/o/r/tree/main%2F..%2F..%2F..%2Fevil%2Fr%2Fmain",
        "https://github.com/o/r/blob/main/x%2f..%2f..%2fevil%2fpackage.json",
        "https://github.com/o/r/tree/main%2fsub",
        "https://github.com/o/r/blob/main",
        "https://github.com/o/r/tree/",
        "https://github.com/o/r/blob/main/%E0%A4%A",
    ])("rejects %s", async (url) => {
        const fetchMock = stubFile();

        await expect(fetchPackageJsonFromRepo(url)).rejects.toThrow(/Invalid repository URL/);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("ignores blob path in query and hash", async () => {
        const fetchMock = stubFile();

        await fetchPackageJsonFromRepo("https://github.com/o/r?p=/blob/x/package.json#/tree/y");

        expect(fetchMock.mock.calls[0][0]).toBe(`${RAW}/main/package.json`);
    });

    it.each([
        [
            "https://gitlab.com/o/r/-/blob/dev/package.json",
            "https://gitlab.com/o/r/-/raw/main/package.json",
        ],
        [
            "https://codeberg.org/o/r/src/branch/dev/package.json",
            "https://codeberg.org/o/r/raw/branch/main/package.json",
        ],
        [
            "https://gitlab.com/o/r/blob/dev/package.json",
            "https://gitlab.com/o/r/-/raw/main/package.json",
        ],
    ])("probes default branches for non-GitHub %s", async (url, rawUrl) => {
        const fetchMock = stubFile();

        const content = await fetchPackageJsonFromRepo(url);

        expect(fetchMock.mock.calls[0][0]).toBe(rawUrl);
        expect(content!.branch).toBe("main");
    });
});

describe("fetchPackageJsonFromRepo failures", () => {
    it("throws on rate limit instead of trying next branch", async () => {
        const fetchMock = vi.fn(async () => statusResponse(HTTP_STATUS.tooManyRequests));
        vi.stubGlobal("fetch", fetchMock);

        await expect(fetchPackageJsonFromRepo("https://github.com/o/r")).rejects.toThrow("429");
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it.each([
        ["repo root", "https://github.com/o/r"],
        ["blob", "https://github.com/o/r/blob/main/package.json"],
    ])("throws + cancels endless %s raw file past 10 MB", async (_label, url) => {
        const cancelSource = stubFetchSized(Infinity);

        await expect(fetchPackageJsonFromRepo(url)).rejects.toThrow("larger than 10 MB");
        expect(cancelSource).toHaveBeenCalled();
    });
});
