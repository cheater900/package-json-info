import { gzipSync } from "node:zlib";
import { concatBytes } from "../../src/utils/bytes";
import { TAR_BLOCK_SIZE, TAR_HEADER, TAR_TYPEFLAG } from "../../src/utils/tarball";

/** Tar archives end with two zero-filled blocks. */
const END_OF_ARCHIVE_BLOCKS = 2;

function writeOctal(bytes: Uint8Array, offset: number, length: number, value: number): void {
    bytes.set(new TextEncoder().encode(value.toString(8).padStart(length - 1, "0")), offset);
}

function tarHeader(name: string, size: number, typeflag: string, prefix = ""): Uint8Array {
    const header = new Uint8Array(TAR_BLOCK_SIZE);
    header.set(new TextEncoder().encode(name), TAR_HEADER.name.offset);
    header.set(new TextEncoder().encode(prefix), TAR_HEADER.prefix.offset);
    writeOctal(header, TAR_HEADER.size.offset, TAR_HEADER.size.length, size);
    header[TAR_HEADER.typeflag.offset] = typeflag.charCodeAt(0);
    return header;
}

/** A PAX record is "<total-length> <key>=<value>\n"; the length counts bytes, including its own digits. */
function paxRecord(key: string, value: string): string {
    const bodyLength = new TextEncoder().encode(`${key}=${value}\n`).length + 1;
    let len = bodyLength;
    for (;;) {
        const candidate = String(len).length + bodyLength;
        if (candidate === len) {
            break;
        }
        len = candidate;
    }
    return `${len} ${key}=${value}\n`;
}

export type TarInput =
    | { name: string; content: string; type?: "file" }
    | { type: "directory"; name: string }
    | { type: "pax"; records: Record<string, string> }
    | { type: "paxRaw"; text: string }
    | { type: "gnuLongName"; path: string }
    /** Entry with any typeflag and USTAR prefix, for types the parser skips or reads leniently. */
    | { type: "raw"; typeflag: string; name: string; content?: string; prefix?: string };

export function buildTar(inputs: TarInput[]): ArrayBuffer {
    const chunks: Uint8Array[] = [];
    const pad = (bytes: Uint8Array): Uint8Array => {
        const padded = new Uint8Array(Math.ceil(bytes.length / TAR_BLOCK_SIZE) * TAR_BLOCK_SIZE);
        padded.set(bytes);
        return padded;
    };

    for (const input of inputs) {
        if (input.type === "directory") {
            chunks.push(tarHeader(input.name, 0, TAR_TYPEFLAG.directory));
            continue;
        }
        if (input.type === "gnuLongName") {
            const bytes = new TextEncoder().encode(`${input.path}\0`);
            chunks.push(tarHeader("././@LongLink", bytes.length, TAR_TYPEFLAG.gnuLongName));
            chunks.push(pad(bytes));
            continue;
        }
        if (input.type === "pax" || input.type === "paxRaw") {
            const text =
                input.type === "paxRaw"
                    ? input.text
                    : Object.entries(input.records)
                          .map(([k, v]) => paxRecord(k, v))
                          .join("");
            const bytes = new TextEncoder().encode(text);
            chunks.push(tarHeader("", bytes.length, TAR_TYPEFLAG.paxHeader));
            chunks.push(pad(bytes));
            continue;
        }
        if (input.type === "raw") {
            const bytes = new TextEncoder().encode(input.content ?? "");
            chunks.push(tarHeader(input.name, bytes.length, input.typeflag, input.prefix));
            chunks.push(pad(bytes));
            continue;
        }
        const bytes = new TextEncoder().encode(input.content);
        chunks.push(tarHeader(input.name, bytes.length, TAR_TYPEFLAG.file));
        chunks.push(pad(bytes));
    }
    chunks.push(new Uint8Array(TAR_BLOCK_SIZE * END_OF_ARCHIVE_BLOCKS));

    return concatBytes(chunks).buffer;
}

/** Gzipped npm-style tarball: every file under the top-level "package/" directory. */
export function buildNpmTarball(files: Record<string, string>): ArrayBuffer {
    const tar = buildTar(
        Object.entries(files).map(([name, content]) => ({ name: `package/${name}`, content })),
    );
    return gzipToArrayBuffer(new Uint8Array(tar));
}

/** Gzips bytes into a standalone ArrayBuffer, as `fetch` would hand over a download. */
export function gzipToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    const gzipped = gzipSync(bytes);
    return gzipped.buffer.slice(gzipped.byteOffset, gzipped.byteOffset + gzipped.byteLength);
}
