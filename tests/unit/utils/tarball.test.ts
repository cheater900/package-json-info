import { describe, it, expect } from "vitest";
import { gzipSync } from "node:zlib";
import { gunzip, parseTar } from "../../../src/utils/tarball";

const BLOCK_SIZE = 512;

function writeOctal(bytes: Uint8Array, offset: number, length: number, value: number): void {
    bytes.set(new TextEncoder().encode(value.toString(8).padStart(length - 1, "0")), offset);
}

function tarHeader(name: string, size: number, typeflag: string): Uint8Array {
    const header = new Uint8Array(BLOCK_SIZE);
    header.set(new TextEncoder().encode(name), 0);
    writeOctal(header, 124, 12, size);
    header[156] = typeflag.charCodeAt(0);
    return header;
}

/** A PAX record is "<total-length> <key>=<value>\n" - the length field includes its own digit count. */
function paxRecord(key: string, value: string): string {
    let len = key.length + value.length + 3;
    for (;;) {
        const candidate = String(len).length + key.length + value.length + 3;
        if (candidate === len) {
            break;
        }
        len = candidate;
    }
    return `${len} ${key}=${value}\n`;
}

type TarInput =
    | { name: string; content: string; type?: "file" }
    | { type: "directory"; name: string }
    | { type: "pax"; records: Record<string, string> };

function buildTar(inputs: TarInput[]): ArrayBuffer {
    const chunks: Uint8Array[] = [];
    const pad = (bytes: Uint8Array): Uint8Array => {
        const padded = new Uint8Array(Math.ceil(bytes.length / BLOCK_SIZE) * BLOCK_SIZE);
        padded.set(bytes);
        return padded;
    };

    for (const input of inputs) {
        if (input.type === "directory") {
            chunks.push(tarHeader(input.name, 0, "5"));
        } else if (input.type === "pax") {
            const text = Object.entries(input.records)
                .map(([k, v]) => paxRecord(k, v))
                .join("");
            const bytes = new TextEncoder().encode(text);
            chunks.push(tarHeader("", bytes.length, "x"));
            chunks.push(pad(bytes));
        } else {
            const bytes = new TextEncoder().encode(input.content);
            chunks.push(tarHeader(input.name, bytes.length, "0"));
            chunks.push(pad(bytes));
        }
    }
    chunks.push(new Uint8Array(BLOCK_SIZE * 2)); // end-of-archive marker

    const total = chunks.reduce((sum, c) => sum + c.length, 0);
    const result = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
    }
    return result.buffer;
}

describe("parseTar", () => {
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
});

describe("gunzip", () => {
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
