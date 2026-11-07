import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchSourceTree } from "../../../src/api/sourceTree";
import { githubToken } from "../../../src/settings";
import { buildNpmTarball, buildTar, gzipToArrayBuffer } from "../../fixtures/tarball";
import {
    HTTP_STATUS,
    binaryResponse,
    jsonResponse,
    statusResponse,
    textResponse,
} from "../../helpers/fetchMock";
import { resetSettings } from "../../helpers/settings";
import { githubTokenFixture } from "../../fixtures/github";

const NPM_TREE_REF = {
    provider: "npm",
    tarballUrl: "https://registry.npmjs.org/x/-/x-1.0.0.tgz",
} as const;

const GITHUB_TREE_REF = { provider: "github", owner: "o", repo: "r", tag: "v1.0.0" } as const;

/** Fetch mock: git-trees API answers `treeBody`, raw file host answers `rawResponse`. */
function stubGithubFetch(treeBody: unknown, rawResponse: unknown = textResponse("content")) {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) =>
        url.includes("api.github.com") ? jsonResponse(treeBody) : rawResponse,
    );
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
}

afterEach(resetSettings);

describe("fetchSourceTree - npm provider", () => {
    it("downloads and decompresses tarball into browsable tree", async () => {
        const tarball = buildNpmTarball({
            "index.js": "module.exports = 1;",
            "src/helper.js": "export const x = 1;",
        });
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => binaryResponse(tarball)),
        );

        const { tree, readFile } = await fetchSourceTree(NPM_TREE_REF);

        const names = tree.map((n) => n.name).sort();
        expect(names).toEqual(["index.js", "src"]);
        expect(await readFile("index.js")).toBe("module.exports = 1;");
        expect(await readFile("src/helper.js")).toBe("export const x = 1;");
    });

    it("strips tarball package/ prefix from paths", async () => {
        const tarball = buildNpmTarball({ "index.js": "x" });
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => binaryResponse(tarball)),
        );

        const { tree } = await fetchSourceTree(NPM_TREE_REF);

        expect(tree[0].path).toBe("index.js");
    });

    it("reads file listed under repeated slashes by normalized path", async () => {
        const tarball = buildNpmTarball({ "/lib//a.js": "a" });
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => binaryResponse(tarball)),
        );

        const { tree, readFile } = await fetchSourceTree(NPM_TREE_REF);

        expect(tree[0].children![0].path).toBe("lib/a.js");
        expect(await readFile("lib/a.js")).toBe("a");
    });

    it("throws on tarball download failure", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => statusResponse(HTTP_STATUS.notFound)),
        );

        await expect(
            fetchSourceTree({ provider: "npm", tarballUrl: "https://example.com/missing.tgz" }),
        ).rejects.toThrow(/404/);
    });

    it("throws corrupt-tarball error for 2xx response without body", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response(null, { status: 204 })),
        );

        await expect(fetchSourceTree(NPM_TREE_REF)).rejects.toThrow(/corrupt or incomplete/);
    });

    it("readFile rejects for path missing from tarball", async () => {
        const tarball = buildNpmTarball({ "index.js": "x" });
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => binaryResponse(tarball)),
        );

        const { readFile } = await fetchSourceTree(NPM_TREE_REF);

        await expect(readFile("nope.js")).rejects.toThrow(
            "File not found in the downloaded tarball: nope.js",
        );
    });

    it("lists explicit empty directory, skips tarball root entry", async () => {
        const tarball = gzipToArrayBuffer(
            new Uint8Array(
                buildTar([
                    { type: "directory", name: "package/" },
                    { type: "directory", name: "package/empty/" },
                ]),
            ),
        );
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => binaryResponse(tarball)),
        );

        const { tree } = await fetchSourceTree(NPM_TREE_REF);

        expect(tree).toEqual([
            { name: "empty", path: "empty", type: "directory", size: 0, children: [] },
        ]);
    });

    it("throws corrupt-tarball error for non-gzip download", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => binaryResponse(new TextEncoder().encode("<html>").buffer)),
        );

        await expect(fetchSourceTree(NPM_TREE_REF)).rejects.toThrow(/corrupt or incomplete/);
    });
});

describe("fetchSourceTree - github provider", () => {
    it("builds tree from git-trees API, fetches file content lazily", async () => {
        const fetchMock = vi.fn(async (url: string) => {
            if (url.includes("api.github.com")) {
                return jsonResponse({
                    tree: [
                        { path: "index.js", type: "blob", size: 10 },
                        { path: "src", type: "tree" },
                        { path: "src/helper.js", type: "blob", size: 5 },
                    ],
                });
            }
            if (url.includes("raw.githubusercontent.com")) {
                return textResponse("file content");
            }
            throw new Error(`unexpected url: ${url}`);
        });
        vi.stubGlobal("fetch", fetchMock);

        const { tree, readFile } = await fetchSourceTree({
            provider: "github",
            owner: "some-org",
            repo: "some-repo",
            tag: "v1.0.0",
        });

        expect(tree.map((n) => n.name).sort()).toEqual(["index.js", "src"]);
        expect(await readFile("index.js")).toBe("file content");
        // The tree call plus exactly one lazy content fetch - never one per file.
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("flags truncated tree", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () =>
                jsonResponse({ tree: [{ path: "a.js", type: "blob" }], truncated: true }),
            ),
        );

        const { truncated } = await fetchSourceTree(GITHUB_TREE_REF);

        expect(truncated).toBe(true);
    });

    it("omits submodule entries", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () =>
                jsonResponse({
                    tree: [
                        { path: "index.js", type: "blob", size: 1 },
                        { path: "vendor", type: "commit" },
                    ],
                }),
            ),
        );

        const { tree } = await fetchSourceTree(GITHUB_TREE_REF);

        expect(tree.map((n) => n.name)).toEqual(["index.js"]);
    });

    it("returns empty tree for answer without tree", async () => {
        stubGithubFetch({});

        const { tree, truncated } = await fetchSourceTree(GITHUB_TREE_REF);

        expect(tree).toEqual([]);
        expect(truncated).toBe(false);
    });

    it("encodes tag and file path segments in request URLs", async () => {
        const fetchMock = stubGithubFetch({ tree: [{ path: "dir #1/a b?.js", type: "blob" }] });

        const { readFile } = await fetchSourceTree({ ...GITHUB_TREE_REF, tag: "release/1.0#x" });
        await readFile("dir #1/a b?.js");

        expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
            "https://api.github.com/repos/o/r/git/trees/release%2F1.0%23x?recursive=1",
            "https://raw.githubusercontent.com/o/r/release%2F1.0%23x/dir%20%231/a%20b%3F.js",
        ]);
    });

    it("sends token to tree API, never to raw file host", async () => {
        githubToken.value = githubTokenFixture;
        const fetchMock = stubGithubFetch({ tree: [{ path: "a.js", type: "blob" }] });

        const { readFile } = await fetchSourceTree(GITHUB_TREE_REF);
        await readFile("a.js");

        const [treeInit, rawInit] = fetchMock.mock.calls.map(([, init]) => init);
        expect(new Headers(treeInit?.headers).get("Authorization")).toBe(
            `Bearer ${githubTokenFixture}`,
        );
        expect(new Headers(rawInit?.headers).has("Authorization")).toBe(false);
    });

    it("readFile throws with status on raw file failure", async () => {
        stubGithubFetch(
            { tree: [{ path: "a.js", type: "blob" }] },
            statusResponse(HTTP_STATUS.notFound),
        );

        const { readFile } = await fetchSourceTree(GITHUB_TREE_REF);

        await expect(readFile("a.js")).rejects.toThrow(
            "Could not fetch file contents (status 404).",
        );
    });

    it("throws on tree request failure", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => statusResponse(HTTP_STATUS.notFound)),
        );

        await expect(fetchSourceTree(GITHUB_TREE_REF)).rejects.toThrow(/404/);
    });
});
