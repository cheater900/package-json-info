import { BYTES_PER_MB, MAX_UNPACKED_TARBALL_BYTES } from "../constants";
import { t } from "../i18n";
import { concatBytes } from "./bytes";

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
    /** Applies to every later entry, so it never names the next one. */
    paxGlobalHeader: "g",
    /** Pre-POSIX per-file extended header, same record format as "x". */
    solarisExtendedHeader: "X",
    gnuLongName: "L",
};

const BYTE_SPACE = 0x20;
const BYTE_EQUALS = 0x3d;
/** Every PAX record ends in "\n", which isn't part of its value. */
const PAX_RECORD_TERMINATOR_LENGTH = 1;

/**
 * Decompresses a gzip stream using the native Compression Streams API.
 * Throws a translated "corrupt tarball" error for non-gzip, truncated or
 * interrupted data instead of the browser's own message, and stops once
 * output exceeds `maxBytes`, cancelling the source. Input is streamed, never
 * buffered whole, so neither a gzip bomb nor an endless download can
 * exhaust the tab's memory.
 */
export async function gunzip(
    compressed: ReadableStream<Uint8Array>,
    maxBytes: number = MAX_UNPACKED_TARBALL_BYTES,
): Promise<Uint8Array> {
    const reader = compressed.pipeThrough(new DecompressionStream("gzip")).getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    for (;;) {
        let chunk: ReadableStreamReadResult<Uint8Array>;
        try {
            chunk = await reader.read();
        } catch {
            throw new Error(t("errors.tarballCorrupt"));
        }
        if (chunk.done) {
            break;
        }
        totalBytes += chunk.value.length;
        if (totalBytes > maxBytes) {
            await reader.cancel();
            throw new Error(t("errors.tarballTooLarge", { megabytes: maxBytes / BYTES_PER_MB }));
        }
        chunks.push(chunk.value);
    }
    return concatBytes(chunks);
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
        const spaceIndex = bytes.indexOf(BYTE_SPACE, offset);
        if (spaceIndex === -1) {
            break;
        }
        const recordLength = parseInt(decoder.decode(bytes.subarray(offset, spaceIndex)), 10);
        const recordEnd = offset + recordLength;
        if (!(recordLength > spaceIndex - offset) || recordEnd > bytes.length) {
            break;
        }
        // Search within this record only: scanning to the block's end for
        // every record lacking "=" would make parsing O(n²).
        const keyValue = bytes.subarray(spaceIndex + 1, recordEnd - PAX_RECORD_TERMINATOR_LENGTH);
        const equalsIndex = keyValue.indexOf(BYTE_EQUALS);
        if (equalsIndex !== -1) {
            const key = decoder.decode(keyValue.subarray(0, equalsIndex));
            records[key] = decoder.decode(keyValue.subarray(equalsIndex + 1));
        }
        offset = recordEnd;
    }
    return records;
}

/**
 * Parses raw (already gunzipped) tar bytes into a flat list of file/
 * directory entries. Supports USTAR-style long names (prefix + name), PAX
 * extended headers (typeflag "x"), which npm tarballs commonly use for
 * paths over the 100-character classic tar limit, and GNU tar's long-name
 * entries (typeflag "L") from tarballs packed with other tools. PAX global
 * headers (typeflag "g"), symlinks and other exotic entry types are skipped - nothing this app needs to browse.
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
        const isSizeGarbled = !Number.isInteger(size) || size < 0;
        const isArchiveTruncated = dataStart + size > bytes.length;
        if (isSizeGarbled || isArchiveTruncated) {
            throw new Error(t("errors.tarballCorrupt"));
        }
        const data = bytes.subarray(dataStart, dataStart + size);
        const path = longPathOverride ?? (prefix ? `${prefix}/${name}` : name);
        offset = dataStart + Math.ceil(size / TAR_BLOCK_SIZE) * TAR_BLOCK_SIZE;
        if (typeflag === TAR_TYPEFLAG.gnuLongName) {
            longPathOverride = readString(data, 0, data.length);
            continue;
        }
        if (
            typeflag === TAR_TYPEFLAG.paxHeader ||
            typeflag === TAR_TYPEFLAG.solarisExtendedHeader
        ) {
            longPathOverride = parsePaxRecords(data).path || longPathOverride;
            continue;
        }
        if (typeflag === TAR_TYPEFLAG.paxGlobalHeader) {
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
