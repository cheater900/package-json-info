import { gzipSync } from "node:zlib";
import { TAR_BLOCK_SIZE, TAR_HEADER, TAR_TYPEFLAG } from "../../src/utils/tarball";

/** Tar archives end with two zero-filled blocks. */
const END_OF_ARCHIVE_BLOCKS = 2;

function writeOctal(bytes: Uint8Array, offset: number, length: number, value: number): void {
    bytes.set(new TextEncoder().encode(value.toString(8).padStart(length - 1, "0")), offset);
}

function tarHeader(name: string, size: number, typeflag: string): Uint8Array {
    const header = new Uint8Array(TAR_BLOCK_SIZE);
    header.set(new TextEncoder().encode(name), TAR_HEADER.name.offset);
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
    | { type: "gnuLongName"; path: string };

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
        if (input.type === "pax") {
            const text = Object.entries(input.records)
                .map(([k, v]) => paxRecord(k, v))
                .join("");
            const bytes = new TextEncoder().encode(text);
            chunks.push(tarHeader("", bytes.length, TAR_TYPEFLAG.paxHeader));
            chunks.push(pad(bytes));
            continue;
        }
        const bytes = new TextEncoder().encode(input.content);
        chunks.push(tarHeader(input.name, bytes.length, TAR_TYPEFLAG.file));
        chunks.push(pad(bytes));
    }
    chunks.push(new Uint8Array(TAR_BLOCK_SIZE * END_OF_ARCHIVE_BLOCKS));

    const total = chunks.reduce((sum, c) => sum + c.length, 0);
    const result = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
    }
    return result.buffer;
}

/** Gzipped npm-style tarball: every file under the top-level "package/" directory. */
export function buildNpmTarball(files: Record<string, string>): ArrayBuffer {
    const tar = buildTar(
        Object.entries(files).map(([name, content]) => ({ name: `package/${name}`, content })),
    );
    const gzipped = gzipSync(new Uint8Array(tar));
    return gzipped.buffer.slice(gzipped.byteOffset, gzipped.byteOffset + gzipped.byteLength);
}
