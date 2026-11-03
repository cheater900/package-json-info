import { describe, it, expect, vi } from "vitest";
import { fetchSourceTree } from "../../../src/api/sourceTree";
import { buildNpmTarball } from "../../fixtures/tarball";
import {
    HTTP_STATUS,
    binaryResponse,
    jsonResponse,
    statusResponse,
    textResponse,
} from "../../helpers/fetchMock";

const NPM_TREE_REF = {
    provider: "npm",
    tarballUrl: "https://registry.npmjs.org/x/-/x-1.0.0.tgz",
} as const;

const GITHUB_TREE_REF = { provider: "github", owner: "o", repo: "r", tag: "v1.0.0" } as const;

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

        await expect(readFile("nope.js")).rejects.toThrow();
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

    it("throws on tree request failure", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => statusResponse(HTTP_STATUS.notFound)),
        );

        await expect(fetchSourceTree(GITHUB_TREE_REF)).rejects.toThrow(/404/);
    });
});
