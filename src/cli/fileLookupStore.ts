import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { lookupKey, StoredLookupSchema } from "../core/utils/memoizeLookup";
import type { LookupKind, LookupStore, StoredLookup } from "../core/utils/memoizeLookup";
import { settle } from "../core/utils/settle";

const CACHE_DIR_NAME = "package-json-info";

/** `$XDG_CACHE_HOME/package-json-info`, else `~/.cache/package-json-info`. */
export function defaultLookupCacheDir(env: NodeJS.ProcessEnv = process.env): string {
    const base = env.XDG_CACHE_HOME || join(homedir(), ".cache");
    return join(base, CACHE_DIR_NAME);
}

/**
 * File copy of last good lookups in `dir`, one file per lookup so parallel
 * saves never share a file. The name is a hash of the key, so a hostile key
 * cannot leave `dir`.
 * Store public metadata only, never tokens or request headers: core passes
 * values only, keep it so.
 * `load` and `save` never reject: a failing disk loses only the copy.
 * The CLI never clears the store, so `generation` stays 0.
 */
export function createFileLookupStore(dir: string): LookupStore {
    const fileOf = (kind: LookupKind, key: string) =>
        join(dir, `${createHash("sha256").update(lookupKey(kind, key)).digest("hex")}.json`);
    return {
        async load<T>(kind: LookupKind, key: string) {
            const read = await settle(async () =>
                JSON.parse(await readFile(fileOf(kind, key), "utf8")),
            );
            const parsed = StoredLookupSchema.safeParse(read.ok ? read.value : undefined);
            return parsed.success ? (parsed.data as StoredLookup<T>) : undefined;
        },
        async save(kind, key, value) {
            const record = { value, savedAt: new Date().toISOString() };
            const file = fileOf(kind, key);
            await settle(async () => {
                await mkdir(dir, { recursive: true });
                const tmp = `${file}.${randomUUID()}.tmp`;
                await writeFile(tmp, JSON.stringify(record));
                await rename(tmp, file);
            });
        },
        generation: () => 0,
    };
}
