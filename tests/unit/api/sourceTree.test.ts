import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchSourceTree } from "../../../src/api/sourceTree";
import { buildNpmTarball } from "../../fixtures/tarball";

beforeEach(() => {
    vi.unstubAllGlobals();
});

describe("fetchSourceTree - npm provider", () => {
    it("downloads and decompresses tarball into browsable tree", async () => {
        const tarball = buildNpmTarball({
            "index.js": "module.exports = 1;",
            "src/helper.js": "export const x = 1;",
        });
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => ({ ok: true, arrayBuffer: async () => tarball })),
        );

        const { tree, readFile } = await fetchSourceTree({
            provider: "npm",
            tarballUrl: "https://registry.npmjs.org/x/-/x-1.0.0.tgz",
        });

        const names = tree.map((n) => n.name).sort();
        expect(names).toEqual(["index.js", "src"]);
        expect(await readFile("index.js")).toBe("module.exports = 1;");
        expect(await readFile("src/helper.js")).toBe("export const x = 1;");
    });

    it("strips tarball package/ prefix from paths", async () => {
        const tarball = buildNpmTarball({ "index.js": "x" });
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => ({ ok: true, arrayBuffer: async () => tarball })),
        );

        const { tree } = await fetchSourceTree({
            provider: "npm",
            tarballUrl: "https://registry.npmjs.org/x/-/x-1.0.0.tgz",
        });

        expect(tree[0].path).toBe("index.js");
    });

    it("throws on tarball download failure", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => ({ ok: false, status: 404 })),
        );

        await expect(
            fetchSourceTree({ provider: "npm", tarballUrl: "https://example.com/missing.tgz" }),
        ).rejects.toThrow(/404/);
    });

    it("readFile rejects for path missing from tarball", async () => {
        const tarball = buildNpmTarball({ "index.js": "x" });
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => ({ ok: true, arrayBuffer: async () => tarball })),
        );

        const { readFile } = await fetchSourceTree({
            provider: "npm",
            tarballUrl: "https://registry.npmjs.org/x/-/x-1.0.0.tgz",
        });

        await expect(readFile("nope.js")).rejects.toThrow();
    });
});

describe("fetchSourceTree - github provider", () => {
    it("builds tree from git-trees API, fetches file content lazily", async () => {
        const fetchMock = vi.fn(async (url: string) => {
            if (url.includes("api.github.com")) {
                return {
                    ok: true,
                    json: async () => ({
                        tree: [
                            { path: "index.js", type: "blob", size: 10 },
                            { path: "src", type: "tree" },
                            { path: "src/helper.js", type: "blob", size: 5 },
                        ],
                    }),
                };
            }
            if (url.includes("raw.githubusercontent.com")) {
                return { ok: true, text: async () => "file content" };
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

    it("throws on tree request failure", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => ({ ok: false, status: 404 })),
        );

        await expect(
            fetchSourceTree({ provider: "github", owner: "o", repo: "r", tag: "v1.0.0" }),
        ).rejects.toThrow(/404/);
    });
});
