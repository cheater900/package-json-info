import { describe, it, expect } from "vitest";
import { MAX_FILE_TREE_DEPTH } from "../../../../src/core/constants";
import { buildFileTree } from "../../../../src/core/utils/fileTree";

describe("buildFileTree", () => {
    it("builds flat file list at root", () => {
        const tree = buildFileTree([
            { path: "b.js", type: "file", size: 2 },
            { path: "a.js", type: "file", size: 1 },
        ]);

        expect(tree).toEqual([
            { name: "a.js", path: "a.js", type: "file", size: 1 },
            { name: "b.js", path: "b.js", type: "file", size: 2 },
        ]);
    });

    it("synthesizes intermediate directories from file path", () => {
        const tree = buildFileTree([{ path: "src/utils/helper.js", type: "file", size: 5 }]);

        expect(tree).toEqual([
            {
                name: "src",
                path: "src",
                type: "directory",
                size: 0,
                children: [
                    {
                        name: "utils",
                        path: "src/utils",
                        type: "directory",
                        size: 0,
                        children: [
                            {
                                name: "helper.js",
                                path: "src/utils/helper.js",
                                type: "file",
                                size: 5,
                            },
                        ],
                    },
                ],
            },
        ]);
    });

    it("reuses one synthesized directory for several files", () => {
        const tree = buildFileTree([
            { path: "src/a.js", type: "file", size: 1 },
            { path: "src/b.js", type: "file", size: 1 },
        ]);

        expect(tree).toHaveLength(1);
        expect(tree[0].children).toHaveLength(2);
        expect(tree[0].children!.map((c) => c.name)).toEqual(["a.js", "b.js"]);
    });

    it("keeps explicit empty directory", () => {
        const tree = buildFileTree([{ path: "empty-dir", type: "directory" }]);

        expect(tree).toEqual([
            { name: "empty-dir", path: "empty-dir", type: "directory", size: 0, children: [] },
        ]);
    });

    it("sorts directories before files, alphabetical per group", () => {
        const tree = buildFileTree([
            { path: "zebra.js", type: "file", size: 1 },
            { path: "apple.js", type: "file", size: 1 },
            { path: "src", type: "directory" },
        ]);

        expect(tree.map((n) => n.name)).toEqual(["src", "apple.js", "zebra.js"]);
    });

    it("sorts recursively within nested directories", () => {
        const tree = buildFileTree([
            { path: "src/z.js", type: "file", size: 1 },
            { path: "src/a.js", type: "file", size: 1 },
        ]);

        expect(tree[0].children!.map((c) => c.name)).toEqual(["a.js", "z.js"]);
    });

    it("ignores trailing slash on directory paths", () => {
        const tree = buildFileTree([{ path: "dir/", type: "directory" }]);

        expect(tree[0].path).toBe("dir");
    });

    it("collapses long inner slash run in linear time", () => {
        const start = performance.now();
        const tree = buildFileTree([{ path: `a${"/".repeat(200_000)}b`, type: "file" }]);

        expect(performance.now() - start).toBeLessThan(1000);
        expect(tree[0].children![0].path).toBe("a/b");
    });

    it.each(["", "/", "//"])("ignores entry with empty path %j", (path) => {
        const tree = buildFileTree([
            { path, type: "file", size: 1 },
            { path: "a.js", type: "file", size: 1 },
        ]);

        expect(tree.map((n) => n.path)).toEqual(["a.js"]);
    });

    it("returns empty tree for no entries", () => {
        expect(buildFileTree([])).toEqual([]);
    });
});

describe("buildFileTree duplicates", () => {
    it("keeps one node for path listed twice", () => {
        const tree = buildFileTree([
            { path: "index.js", type: "file", size: 1 },
            { path: "index.js", type: "file", size: 2 },
        ]);

        expect(tree).toEqual([{ name: "index.js", path: "index.js", type: "file", size: 2 }]);
    });

    it("keeps one directory for trailing-slash duplicate", () => {
        const tree = buildFileTree([
            { path: "src", type: "directory" },
            { path: "src/", type: "directory" },
        ]);

        expect(tree).toHaveLength(1);
    });
});

describe("buildFileTree depth", () => {
    it("builds path at MAX_FILE_TREE_DEPTH", () => {
        const path = "d/".repeat(MAX_FILE_TREE_DEPTH - 1) + "f.js";

        expect(buildFileTree([{ path, type: "file" }])).toHaveLength(1);
    });

    it.each(["file", "directory"] as const)(
        "throws translated error for %s path deeper than MAX_FILE_TREE_DEPTH",
        (type) => {
            const path = "d/".repeat(100_000) + "leaf";

            expect(() => buildFileTree([{ path, type }])).toThrow(/too deep to browse/);
        },
    );
});
