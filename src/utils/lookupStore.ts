import { z } from "zod";
import { LOOKUP_DB_NAME, LOOKUP_DB_STORE, LOOKUP_READ_TIMEOUT_MS } from "../constants";
import { delay } from "./delay";
import { withObjectStore } from "./indexedDb";
import { settle } from "./settle";

const StoredLookupSchema = z.object({
    value: z.unknown(),
    savedAt: z.string(),
});

/** Metadata lookups whose last good value is kept for offline use. */
export type LookupKind =
    | "registry"
    | "weeklyDownloads"
    | "vulnerabilityCount"
    | "bundleSize"
    | "repoStars"
    | "repoIssueCounts"
    | "githubReleaseTag";

/** Last good value of one lookup; `savedAt` is an ISO timestamp. */
export type StoredLookup<T> = {
    value: T;
    savedAt: string;
};

function isLookupStoreAvailable(): boolean {
    return typeof indexedDB !== "undefined";
}

function recordKey(kind: LookupKind, key: string): string {
    return `${kind}:${key}`;
}

/**
 * Keeps `value` as the last good answer of lookup `kind` for `key`.
 * Store public metadata only, never tokens or request headers.
 * Never rejects: a failing IndexedDB (quota, blocked) loses only the copy.
 */
export async function saveLookup(kind: LookupKind, key: string, value: unknown): Promise<void> {
    if (!isLookupStoreAvailable()) {
        return;
    }
    const record = { value, savedAt: new Date().toISOString() };
    await settle(() =>
        withObjectStore(LOOKUP_DB_NAME, LOOKUP_DB_STORE, "readwrite", (store) =>
            store.put(record, recordKey(kind, key)),
        ),
    );
}

/**
 * Drops every stored lookup. With a token these include private repo data,
 * so token purge calls this. Never rejects.
 */
export async function clearLookups(): Promise<void> {
    if (!isLookupStoreAvailable()) {
        return;
    }
    await settle(() =>
        withObjectStore(LOOKUP_DB_NAME, LOOKUP_DB_STORE, "readwrite", (store) => store.clear()),
    );
}

/**
 * Last good answer of lookup `kind` for `key`. Undefined when none is
 * stored, or IndexedDB is missing, failing or not answering in time.
 * Never rejects. The caller names `T`: the store holds what saveLookup got.
 */
export async function loadLookup<T>(
    kind: LookupKind,
    key: string,
): Promise<StoredLookup<T> | undefined> {
    if (!isLookupStoreAvailable()) {
        return undefined;
    }
    const result = await settle(() =>
        Promise.race([
            withObjectStore(LOOKUP_DB_NAME, LOOKUP_DB_STORE, "readonly", (store) =>
                store.get(recordKey(kind, key)),
            ),
            delay(LOOKUP_READ_TIMEOUT_MS),
        ]),
    );
    const parsed = StoredLookupSchema.safeParse(result.ok ? result.value : undefined);
    return parsed.success ? (parsed.data as StoredLookup<T>) : undefined;
}
