import { describe, it, expect, vi, beforeEach } from "vitest";
import { gzipSync } from "node:zlib";
import { fetchSourceTree, findGithubReleaseTag } from "../../../src/utils/sourceTree";

const BLOCK_SIZE = 512;

function writeOctal(bytes: Uint8Array, offset: number, length: number, value: number): void {
    bytes.set(new TextEncoder().encode(value.toString(8).padStart(length - 1, "0")), offset);
}

function tarHeader(name: string, size: number): Uint8Array {
    const header = new Uint8Array(BLOCK_SIZE);
    header.set(new TextEncoder().encode(name), 0);
    writeOctal(header, 124, 12, size);
    header[156] = "0".charCodeAt(0);
    return header;
}

/** Builds a minimal gzipped npm-style tarball (single top-level "package/" prefix) with the given files. */
function buildNpmTarball(files: Record<string, string>): ArrayBuffer {
    const chunks: Uint8Array[] = [];
    for (const [name, content] of Object.entries(files)) {
        const bytes = new TextEncoder().encode(content);
        chunks.push(tarHeader(`package/${name}`, bytes.length));
        const padded = new Uint8Array(Math.ceil(bytes.length / BLOCK_SIZE) * BLOCK_SIZE);
        padded.set(bytes);
        chunks.push(padded);
    }
    chunks.push(new Uint8Array(BLOCK_SIZE * 2));

    const total = chunks.reduce((sum, c) => sum + c.length, 0);
    const tar = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        tar.set(chunk, offset);
        offset += chunk.length;
    }
    const gzipped = gzipSync(tar);
    return gzipped.buffer.slice(gzipped.byteOffset, gzipped.byteOffset + gzipped.byteLength);
}

beforeEach(() => {
    vi.unstubAllGlobals();
});

describe("fetchSourceTree - npm provider", () => {
    it("downloads and decompresses the tarball into a browsable tree", async () => {
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

    it("strips the tarball's leading package/ prefix from every path", async () => {
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

    it("throws when the tarball download fails", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => ({ ok: false, status: 404 })),
        );

        await expect(
            fetchSourceTree({ provider: "npm", tarballUrl: "https://example.com/missing.tgz" }),
        ).rejects.toThrow(/404/);
    });

    it("readFile rejects for a path that isn't in the tarball", async () => {
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
    it("builds a tree from the git-trees API and lazily fetches file content on demand", async () => {
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

    it("throws when the tree request fails", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => ({ ok: false, status: 404 })),
        );

        await expect(
            fetchSourceTree({ provider: "github", owner: "o", repo: "r", tag: "v1.0.0" }),
        ).rejects.toThrow(/404/);
    });
});

describe("findGithubReleaseTag", () => {
    it("returns the v-prefixed tag when it exists", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async (url: string) => ({ ok: url.endsWith("/tags/v1.2.3") })),
        );

        expect(await findGithubReleaseTag("o", "r", "1.2.3")).toBe("v1.2.3");
    });

    it("falls back to the bare version when the v-prefixed tag doesn't exist", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async (url: string) => ({ ok: url.endsWith("/tags/1.2.3") })),
        );

        expect(await findGithubReleaseTag("o", "r", "1.2.3")).toBe("1.2.3");
    });

    it("returns null when neither tag naming pattern exists", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => ({ ok: false })),
        );

        expect(await findGithubReleaseTag("o", "r", "1.2.3")).toBeNull();
    });
});
