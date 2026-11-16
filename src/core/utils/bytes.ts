import { BYTES_PER_KB, BYTES_PER_MB, MAX_SOURCE_TEXT_BYTES } from "../constants";
import { t } from "../i18n";

const BYTE_SIZE_DECIMALS = 1;

/** Joins byte chunks into one contiguous array. */
export function concatBytes(chunks: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
    const result = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
    let offset = 0;
    for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
    }
    return result;
}

/**
 * Every byte of `stream`, or null once it passes `maxBytes`: the rest gets
 * cancelled unread, so an endless stream stops there.
 */
export async function readBytesUpTo(
    stream: ReadableStream<Uint8Array>,
    maxBytes: number,
): Promise<Uint8Array<ArrayBuffer> | null> {
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    for (;;) {
        const chunk = await reader.read();
        if (chunk.done) {
            return concatBytes(chunks);
        }
        totalBytes += chunk.value.length;
        if (totalBytes > maxBytes) {
            await reader.cancel();
            return null;
        }
        chunks.push(chunk.value);
    }
}

/**
 * UTF-8 text of a package.json or pnpm-workspace.yaml stream, without a
 * leading BOM. Throws once it passes MAX_SOURCE_TEXT_BYTES: the URL host or a
 * symlinked file (`/dev/zero`) picks the size.
 */
export async function readSourceStreamText(stream: ReadableStream<Uint8Array>): Promise<string> {
    const bytes = await readBytesUpTo(stream, MAX_SOURCE_TEXT_BYTES);
    if (!bytes) {
        throw new Error(
            t("errors.sourceTooLarge", { megabytes: MAX_SOURCE_TEXT_BYTES / BYTES_PER_MB }),
        );
    }
    return new TextDecoder().decode(bytes);
}

/** Byte count as KB, one decimal. */
export function formatKilobytes(bytes: number): string {
    return t("cell.kilobytes", { size: (bytes / BYTES_PER_KB).toFixed(BYTE_SIZE_DECIMALS) });
}

/** Byte count as KB below 1 MB, else as MB; one decimal. */
export function formatByteSize(bytes: number): string {
    if (bytes < BYTES_PER_MB) {
        return formatKilobytes(bytes);
    }
    return t("cell.megabytes", { size: (bytes / BYTES_PER_MB).toFixed(BYTE_SIZE_DECIMALS) });
}
