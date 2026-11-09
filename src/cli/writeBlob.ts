import { writeFile } from "node:fs/promises";

/** Writes the bytes of `blob` to `path`. */
export async function writeBlob(path: string, blob: Blob): Promise<void> {
    await writeFile(path, Buffer.from(await blob.arrayBuffer()));
}
