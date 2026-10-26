import { describe, it, expect } from "vitest";
import { gzipSync } from "node:zlib";
import { gunzip, parseTar, TAR_BLOCK_SIZE, TAR_HEADER } from "../../../src/utils/tarball";
import { buildTar } from "../../fixtures/tarball";

describe("parseTar", () => {
    it("throws on archive cut mid-file", () => {
        const tar = new Uint8Array(
            buildTar([{ name: "package/index.js", content: "x".repeat(TAR_BLOCK_SIZE * 2) }]),
        );

        expect(() => parseTar(tar.subarray(0, TAR_BLOCK_SIZE * 2))).toThrow(
            /corrupt or incomplete/,
        );
    });

    it("throws on unreadable size field", () => {
        const tar = new Uint8Array(buildTar([{ name: "package/index.js", content: "x" }]));
        tar.set(
            new TextEncoder().encode("z".repeat(TAR_HEADER.size.length - 1)),
            TAR_HEADER.size.offset,
        );

        expect(() => parseTar(tar)).toThrow(/corrupt or incomplete/);
    });

    it("parses single file entry with content intact", () => {
        const entries = parseTar(
            new Uint8Array(buildTar([{ name: "package/index.js", content: "console.log(1);" }])),
        );

        expect(entries).toHaveLength(1);
        expect(entries[0].path).toBe("package/index.js");
        expect(entries[0].type).toBe("file");
        expect(entries[0].size).toBe("console.log(1);".length);
        expect(new TextDecoder().decode(entries[0].content)).toBe("console.log(1);");
    });

    it("parses multiple files in order", () => {
        const entries = parseTar(
            new Uint8Array(
                buildTar([
                    { name: "package/a.js", content: "a" },
                    { name: "package/b.js", content: "b" },
                ]),
            ),
        );

        expect(entries.map((e) => e.path)).toEqual(["package/a.js", "package/b.js"]);
    });

    it("parses explicit directory entry", () => {
        const entries = parseTar(
            new Uint8Array(buildTar([{ type: "directory", name: "package/src/" }])),
        );

        expect(entries).toEqual([
            { path: "package/src/", size: 0, type: "directory", content: new Uint8Array(0) },
        ]);
    });

    it("stops at end-of-archive zero block", () => {
        const entries = parseTar(
            new Uint8Array(buildTar([{ name: "package/only.js", content: "x" }])),
        );

        expect(entries).toHaveLength(1);
    });

    it("returns empty list for empty archive", () => {
        expect(parseTar(new Uint8Array(buildTar([])))).toEqual([]);
    });

    it("applies PAX header path to next entry only", () => {
        const longPath = `package/${"deep/".repeat(20)}file.js`;
        const entries = parseTar(
            new Uint8Array(
                buildTar([
                    { type: "pax", records: { path: longPath } },
                    { name: "ignored-short-name.js", content: "content" },
                    { name: "package/normal.js", content: "normal" },
                ]),
            ),
        );

        expect(entries.map((e) => e.path)).toEqual([longPath, "package/normal.js"]);
    });

    it("applies GNU long-name path to next entry only", () => {
        const longPath = `package/${"deep/".repeat(25)}file.js`;
        const entries = parseTar(
            new Uint8Array(
                buildTar([
                    { type: "gnuLongName", path: longPath },
                    { name: "truncated-name.js", content: "content" },
                    { name: "package/normal.js", content: "normal" },
                ]),
            ),
        );

        expect(entries.map((e) => e.path)).toEqual([longPath, "package/normal.js"]);
    });
});

describe("gunzip", () => {
    it("rejects output over size cap", async () => {
        const gzipped = gzipSync(new Uint8Array(4096));

        await expect(
            gunzip(
                gzipped.buffer.slice(gzipped.byteOffset, gzipped.byteOffset + gzipped.byteLength),
                1024,
            ),
        ).rejects.toThrow("too large to browse");
    });

    it("rejects non-gzip data as corrupt tarball", async () => {
        const notGzip = new TextEncoder().encode("<html>not a tarball</html>");

        await expect(gunzip(notGzip.buffer)).rejects.toThrow("tarball is corrupt");
    });

    it("decompresses gzip buffer to original bytes", async () => {
        const original = new TextEncoder().encode("hello world");
        const gzipped = gzipSync(original);

        const result = await gunzip(
            gzipped.buffer.slice(gzipped.byteOffset, gzipped.byteOffset + gzipped.byteLength),
        );

        expect(new TextDecoder().decode(result)).toBe("hello world");
    });

    it("round-trips gzipped tar archive", async () => {
        const tar = buildTar([{ name: "package/index.js", content: "module.exports = 1;" }]);
        const gzipped = gzipSync(new Uint8Array(tar));

        const rawTar = await gunzip(
            gzipped.buffer.slice(gzipped.byteOffset, gzipped.byteOffset + gzipped.byteLength),
        );
        const entries = parseTar(rawTar);

        expect(entries).toHaveLength(1);
        expect(new TextDecoder().decode(entries[0].content)).toBe("module.exports = 1;");
    });
});

describe("parseTar edge cases", () => {
    it("reads non-ASCII PAX path and following entry", () => {
        const unicodePath = `package/${"日本語-ファイル-".repeat(8)}.js`;
        const entries = parseTar(
            new Uint8Array(
                buildTar([
                    { type: "pax", records: { path: unicodePath, comment: "é" } },
                    { name: "package/short-name.js", content: "a" },
                    { name: "package/next.js", content: "b" },
                ]),
            ),
        );

        expect(entries.map((e) => e.path)).toEqual([unicodePath, "package/next.js"]);
    });

    it("returns empty list for empty input", () => {
        expect(parseTar(new Uint8Array(0))).toEqual([]);
    });
});
