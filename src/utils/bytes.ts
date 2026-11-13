import { BYTES_PER_KB, BYTES_PER_MB } from "../constants";
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

/** Byte count as KB below 1 MB, else as MB; one decimal. */
export function formatByteSize(bytes: number): string {
    if (bytes < BYTES_PER_MB) {
        return t("cell.kilobytes", { size: (bytes / BYTES_PER_KB).toFixed(BYTE_SIZE_DECIMALS) });
    }
    return t("cell.megabytes", { size: (bytes / BYTES_PER_MB).toFixed(BYTE_SIZE_DECIMALS) });
}
