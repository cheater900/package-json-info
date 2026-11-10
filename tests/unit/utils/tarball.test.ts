import { describe, it, expect } from "vitest";
import { concatBytes } from "../../../src/utils/bytes";
import {
    gunzip,
    parseTar,
    TAR_BLOCK_SIZE,
    TAR_HEADER,
    TAR_TYPEFLAG,
} from "../../../src/utils/tarball";
import { buildTar, gzipToArrayBuffer } from "../../fixtures/tarball";

const TYPEFLAG_SYMLINK = "2";

function streamOf(buffer: ArrayBuffer): ReadableStream<Uint8Array> {
    return new Response(buffer).body!;
}

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

    it("ignores entries after end-of-archive zero block", () => {
        const tar = concatBytes([
            new Uint8Array(buildTar([{ name: "package/only.js", content: "x" }])),
            new Uint8Array(buildTar([{ name: "package/after-end.js", content: "y" }])),
        ]);

        expect(parseTar(tar).map((e) => e.path)).toEqual(["package/only.js"]);
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
        const maxBytes = 1024;
        const oversized = gzipToArrayBuffer(new Uint8Array(maxBytes + 1));

        await expect(gunzip(streamOf(oversized), maxBytes)).rejects.toThrow("too large to browse");
    });

    it("accepts output exactly at size cap", async () => {
        const maxBytes = 1024;
        const atCap = gzipToArrayBuffer(new Uint8Array(maxBytes));

        expect(await gunzip(streamOf(atCap), maxBytes)).toHaveLength(maxBytes);
    });

    it("stops endless download once output passes cap", async () => {
        const endless = new ReadableStream<Uint8Array>({
            pull(controller) {
                controller.enqueue(new Uint8Array(TAR_BLOCK_SIZE));
            },
        }).pipeThrough(new CompressionStream("gzip"));

        await expect(gunzip(endless, TAR_BLOCK_SIZE * 4)).rejects.toThrow("too large to browse");
    });

    it("rejects interrupted download as corrupt tarball", async () => {
        const interrupted = new ReadableStream<Uint8Array>({
            pull(controller) {
                controller.error(new TypeError("network error"));
            },
        });

        await expect(gunzip(interrupted)).rejects.toThrow("tarball is corrupt");
    });

    it("rejects non-gzip data as corrupt tarball", async () => {
        const notGzip = new TextEncoder().encode("<html>not a tarball</html>");

        await expect(gunzip(streamOf(notGzip.buffer))).rejects.toThrow("tarball is corrupt");
    });

    it("rejects gzip cut mid-stream as corrupt tarball", async () => {
        const gzipped = gzipToArrayBuffer(crypto.getRandomValues(new Uint8Array(4096)));

        await expect(gunzip(streamOf(gzipped.slice(0, gzipped.byteLength / 2)))).rejects.toThrow(
            "tarball is corrupt",
        );
    });

    it("decompresses gzip buffer to original bytes", async () => {
        const original = new TextEncoder().encode("hello world");

        const result = await gunzip(streamOf(gzipToArrayBuffer(original)));

        expect(new TextDecoder().decode(result)).toBe("hello world");
    });

    it("round-trips gzipped tar archive", async () => {
        const tar = buildTar([{ name: "package/index.js", content: "module.exports = 1;" }]);
        const rawTar = await gunzip(streamOf(gzipToArrayBuffer(new Uint8Array(tar))));
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

    it("reads blank size field as empty file", () => {
        const tar = new Uint8Array(
            buildTar([
                { name: "package/empty.js", content: "" },
                { name: "package/next.js", content: "n" },
            ]),
        );
        tar.fill(0, TAR_HEADER.size.offset, TAR_HEADER.size.offset + TAR_HEADER.size.length);

        const entries = parseTar(tar);

        expect(entries.map((e) => [e.path, e.size])).toEqual([
            ["package/empty.js", 0],
            ["package/next.js", 1],
        ]);
    });

    it("joins USTAR prefix and name", () => {
        const entries = parseTar(
            new Uint8Array(
                buildTar([
                    {
                        type: "raw",
                        typeflag: TAR_TYPEFLAG.file,
                        prefix: "package/deep",
                        name: "file.js",
                        content: "a",
                    },
                ]),
            ),
        );

        expect(entries.map((e) => e.path)).toEqual(["package/deep/file.js"]);
    });

    it("lists legacy NUL-typeflag entry as file", () => {
        const entries = parseTar(
            new Uint8Array(
                buildTar([
                    {
                        type: "raw",
                        typeflag: TAR_TYPEFLAG.legacyFile,
                        name: "package/old.js",
                        content: "old",
                    },
                ]),
            ),
        );

        expect(entries).toHaveLength(1);
        expect(entries[0].type).toBe("file");
        expect(new TextDecoder().decode(entries[0].content)).toBe("old");
    });

    it("skips symlink entry, keeps following entry", () => {
        const entries = parseTar(
            new Uint8Array(
                buildTar([
                    { type: "raw", typeflag: TYPEFLAG_SYMLINK, name: "package/link" },
                    { name: "package/real.js", content: "a" },
                ]),
            ),
        );

        expect(entries.map((e) => e.path)).toEqual(["package/real.js"]);
    });

    it("skips PAX global header, keeps following entry name", () => {
        const entries = parseTar(
            new Uint8Array(
                buildTar([
                    {
                        type: "raw",
                        typeflag: TAR_TYPEFLAG.paxGlobalHeader,
                        name: "pax_global_header",
                        content: "18 path=global.js\n",
                    },
                    { name: "package/a.js", content: "a" },
                    { name: "package/b.js", content: "b" },
                ]),
            ),
        );

        expect(entries.map((e) => e.path)).toEqual(["package/a.js", "package/b.js"]);
    });

    it("keeps PAX path override across PAX global header", () => {
        const entries = parseTar(
            new Uint8Array(
                buildTar([
                    { type: "pax", records: { path: "package/long-name.js" } },
                    {
                        type: "raw",
                        typeflag: TAR_TYPEFLAG.paxGlobalHeader,
                        name: "pax_global_header",
                    },
                    { name: "package/short.js", content: "a" },
                ]),
            ),
        );

        expect(entries.map((e) => e.path)).toEqual(["package/long-name.js"]);
    });

    it("reads path from Solaris extended header", () => {
        const entries = parseTar(
            new Uint8Array(
                buildTar([
                    {
                        type: "raw",
                        typeflag: TAR_TYPEFLAG.solarisExtendedHeader,
                        name: "",
                        content: "29 path=package/long-name.js\n",
                    },
                    { name: "package/short.js", content: "a" },
                ]),
            ),
        );

        expect(entries.map((e) => e.path)).toEqual(["package/long-name.js"]);
    });

    it("keeps entry name after PAX header without path record", () => {
        const entries = parseTar(
            new Uint8Array(
                buildTar([
                    { type: "pax", records: { mtime: "1700000000" } },
                    { name: "package/a.js", content: "a" },
                ]),
            ),
        );

        expect(entries.map((e) => e.path)).toEqual(["package/a.js"]);
    });

    it.each([
        ["no length prefix", "path=evil.js\n"],
        ["length past block end", "999 path=evil.js\n"],
        ["length shorter than own prefix", "1 path=evil.js\n"],
        ["non-numeric length", "zz path=evil.js\n"],
    ])("keeps entry name after malformed PAX record: %s", (_case, text) => {
        const entries = parseTar(
            new Uint8Array(
                buildTar([
                    { type: "paxRaw", text },
                    { name: "package/a.js", content: "a" },
                ]),
            ),
        );

        expect(entries.map((e) => e.path)).toEqual(["package/a.js"]);
    });

    it("skips many PAX records lacking = in linear time", () => {
        const tar = buildTar([
            { type: "paxRaw", text: "4 a\n".repeat(200_000) },
            { name: "package/a.js", content: "a" },
        ]);
        const start = performance.now();

        expect(parseTar(new Uint8Array(tar)).map((e) => e.path)).toEqual(["package/a.js"]);
        expect(performance.now() - start).toBeLessThan(1000);
    });
});
