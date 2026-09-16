const BLOCK_SIZE = 512;

export type TarEntry = {
    path: string;
    size: number;
    type: "file" | "directory";
    content: Uint8Array;
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
    for (let i = 0; i < BLOCK_SIZE; i++) {
        if (bytes[offset + i] !== 0) return false;
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
        if (spaceIndex === -1) break;
        const recordLength = parseInt(text.slice(offset, spaceIndex), 10);
        if (!recordLength || recordLength <= spaceIndex - offset) break;
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

    while (offset + BLOCK_SIZE <= bytes.length) {
        if (isZeroBlock(bytes, offset)) break;

        const name = readString(bytes, offset, 100);
        const size = readOctal(bytes, offset + 124, 12);
        const typeflag = String.fromCharCode(bytes[offset + 156]);
        const prefix = readString(bytes, offset + 345, 155);
        const dataStart = offset + BLOCK_SIZE;
        const data = bytes.subarray(dataStart, dataStart + size);
        const path = longPathOverride ?? (prefix ? `${prefix}/${name}` : name);

        if (typeflag === "x" || typeflag === "X") {
            const records = parsePaxRecords(data);
            if (records.path) longPathOverride = records.path;
        } else {
            if (typeflag === "5") {
                entries.push({ path, size: 0, type: "directory", content: new Uint8Array(0) });
            } else if (typeflag === "0" || typeflag === "\0") {
                entries.push({ path, size, type: "file", content: data.slice() });
            }
            longPathOverride = null;
        }

        offset = dataStart + Math.ceil(size / BLOCK_SIZE) * BLOCK_SIZE;
    }

    return entries;
}
