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

/**
 * Parses a PAX extended-header data block ("<len> <key>=<value>\n" records,
 * length-prefixed) into a key/value map. Only the fields this app cares
 * about (currently just "path") need to survive here.
 */
function parsePaxRecords(bytes: Uint8Array): Record<string, string> {
    const text = new TextDecoder().decode(bytes);
    const records: Record<string, string> = {};
    let offset = 0;
    while (offset < text.length) {
        const spaceIndex = text.indexOf(" ", offset);
        if (spaceIndex === -1) {
            break;
        }
        const recordLength = parseInt(text.slice(offset, spaceIndex), 10);
        if (!recordLength || recordLength <= spaceIndex - offset) {
            break;
        }
        const record = text.slice(offset, offset + recordLength);
        const eq = record.indexOf("=", spaceIndex - offset + 1);
        if (eq !== -1) {
            const key = record.slice(spaceIndex - offset + 1, eq);
            // Drop the trailing "\n" the record is required to end with.
            const value = record.slice(eq + 1, record.length - 1);
            records[key] = value;
        }
        offset += recordLength;
    }
    return records;
}

/**
 * Parses raw (already gunzipped) tar bytes into a flat list of file/
 * directory entries. Supports USTAR-style long names (prefix + name) and
 * PAX extended headers (typeflag "x"), which npm tarballs commonly use for
 * paths over the 100-character classic tar limit. Symlinks and other
 * exotic entry types are skipped - nothing this app needs to browse.
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
