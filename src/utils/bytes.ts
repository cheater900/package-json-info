/** Joins byte chunks into one contiguous array. */
export function concatBytes(chunks: readonly Uint8Array[]): Uint8Array {
    const result = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
    let offset = 0;
    for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
    }
    return result;
}
