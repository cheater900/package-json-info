import { t } from "../i18n";

export type TarEntry = {
    path: string;
    size: number;
    type: "file" | "directory";
    content: Uint8Array;
};

export const TAR_BLOCK_SIZE = 512;

/** USTAR header field offsets and lengths, in bytes. */
export const TAR_HEADER = {
    name: { offset: 0, length: 100 },
    size: { offset: 124, length: 12 },
    typeflag: { offset: 156 },
    prefix: { offset: 345, length: 155 },
};

export const TAR_TYPEFLAG = {
    file: "0",
    legacyFile: "\0",
    directory: "5",
    paxHeader: "x",
    paxGlobalHeader: "X",
};

/** Decompresses a gzip-compressed buffer using the native Compression Streams API. */
export async function gunzip(data: ArrayBuffer): Promise<Uint8Array> {
    const stream = new ReadableStream({
        start(controller) {
            controller.enqueue(new Uint8Array(data));
            controller.close();
        },
    }).pipeThrough(new DecompressionStream("gzip"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
}

function readString(bytes: Uint8Array, offset: number, length: number): string {
    const slice = bytes.subarray(offset, offset + length);
    const nul = slice.indexOf(0);
    return new TextDecoder().decode(nul === -1 ? slice : slice.subarray(0, nul));
}

/** Tar size/mode fields are ascii octal, null- or space-padded. */
function readOctal(bytes: Uint8Array, offset: number, length: number): number {
    const str = readString(bytes, offset, length).trim();
    return str ? parseInt(str, 8) : 0;
}

function isZeroBlock(bytes: Uint8Array, offset: number): boolean {
    for (let i = 0; i < TAR_BLOCK_SIZE; i++) {
        if (bytes[offset + i] !== 0) {
            return false;
        }
    }
    return true;
}

const SPACE_BYTE = 0x20;
const EQUALS_BYTE = 0x3d;
/** Every PAX record ends in "\n", which isn't part of its value. */
const PAX_RECORD_TERMINATOR_LENGTH = 1;

/**
 * Parses a PAX extended-header data block ("<len> <key>=<value>\n" records)
 * into a key/value map. `<len>` counts bytes, so records are sliced as bytes
 * and decoded one by one: non-ASCII paths would misalign a string-based scan.
 * Stops at the first malformed record.
 */
function parsePaxRecords(bytes: Uint8Array): Record<string, string> {
    const decoder = new TextDecoder();
    const records: Record<string, string> = {};
    let offset = 0;
    while (offset < bytes.length) {
        const spaceIndex = bytes.indexOf(SPACE_BYTE, offset);
        if (spaceIndex === -1) {
            break;
        }
        const recordLength = parseInt(decoder.decode(bytes.subarray(offset, spaceIndex)), 10);
        const recordEnd = offset + recordLength;
        if (!(recordLength > spaceIndex - offset) || recordEnd > bytes.length) {
            break;
        }
        const equalsIndex = bytes.indexOf(EQUALS_BYTE, spaceIndex + 1);
        if (equalsIndex !== -1 && equalsIndex < recordEnd) {
            const key = decoder.decode(bytes.subarray(spaceIndex + 1, equalsIndex));
            records[key] = decoder.decode(
                bytes.subarray(equalsIndex + 1, recordEnd - PAX_RECORD_TERMINATOR_LENGTH),
            );
        }
        offset = recordEnd;
    }
    return records;
}

/**
 * Parses raw (already gunzipped) tar bytes into a flat list of file/
 * directory entries. Supports USTAR-style long names (prefix + name) and
 * PAX extended headers (typeflag "x"), which npm tarballs commonly use for
 * paths over the 100-character classic tar limit. Symlinks and other
 * exotic entry types are skipped - nothing this app needs to browse.
 * Throws when a header's size is unreadable or runs past the archive's end.
 */
export function parseTar(bytes: Uint8Array): TarEntry[] {
    const entries: TarEntry[] = [];
    let offset = 0;
    let longPathOverride: string | null = null;
    while (offset + TAR_BLOCK_SIZE <= bytes.length) {
        if (isZeroBlock(bytes, offset)) {
            break;
        }
        const name = readString(bytes, offset + TAR_HEADER.name.offset, TAR_HEADER.name.length);
        const size = readOctal(bytes, offset + TAR_HEADER.size.offset, TAR_HEADER.size.length);
        const typeflag = String.fromCharCode(bytes[offset + TAR_HEADER.typeflag.offset]);
        const prefix = readString(
            bytes,
            offset + TAR_HEADER.prefix.offset,
            TAR_HEADER.prefix.length,
        );
        const dataStart = offset + TAR_BLOCK_SIZE;
        // A garbled size field or a cut-off download would otherwise yield a
        // silently partial tree.
        if (!Number.isInteger(size) || size < 0 || dataStart + size > bytes.length) {
            throw new Error(t("errors.tarballCorrupt"));
        }
        const data = bytes.subarray(dataStart, dataStart + size);
        const path = longPathOverride ?? (prefix ? `${prefix}/${name}` : name);
        offset = dataStart + Math.ceil(size / TAR_BLOCK_SIZE) * TAR_BLOCK_SIZE;
        if (typeflag === TAR_TYPEFLAG.paxHeader || typeflag === TAR_TYPEFLAG.paxGlobalHeader) {
            longPathOverride = parsePaxRecords(data).path || longPathOverride;
            continue;
        }
        longPathOverride = null;
        if (typeflag === TAR_TYPEFLAG.directory) {
            entries.push({ path, size: 0, type: "directory", content: new Uint8Array(0) });
            continue;
        }
        if (typeflag === TAR_TYPEFLAG.file || typeflag === TAR_TYPEFLAG.legacyFile) {
            entries.push({ path, size, type: "file", content: data.slice() });
        }
    }
    return entries;
}
