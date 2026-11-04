import { z } from "zod";
import { LOOKUP_DB_NAME, LOOKUP_DB_STORE, LOOKUP_READ_TIMEOUT_MS } from "../constants";
import { delay } from "./delay";
import { withObjectStore } from "./indexedDb";
import { settle } from "./settle";

const StoredLookupSchema = z.object({
    value: z.unknown(),
    // ISO in UTC: staleSince picks the oldest by text order.
    savedAt: z.iso.datetime(),
});

/** Metadata lookups whose last good value is kept for offline use. */
export type LookupKind =
    | "registry"
    | "weeklyDownloads"
    | "vulnerabilityCount"
    | "bundleSize"
    | "repoStars"
    | "repoCommits"
    | "repoIssueCounts"
    | "githubReleaseTag";

/** Last good value of one lookup; `savedAt` is an ISO timestamp. */
export type StoredLookup<T> = {
    value: T;
    savedAt: string;
};

// Bumped by clearLookups; a lookup started before a clear must not save after it.
let storeGeneration = 0;

/** Pass to saveLookup, read when the lookup starts. */
export function lookupStoreGeneration(): number {
    return storeGeneration;
}

function isLookupStoreAvailable(): boolean {
    return typeof indexedDB !== "undefined";
}

/** Identity of lookup `kind` for `key`, shared by the store and in-memory maps. */
export function lookupKey(kind: LookupKind, key: string): string {
    return `${kind}:${key}`;
}

/**
 * Keeps `value` as the last good answer of lookup `kind` for `key`.
 * Store public metadata only, never tokens or request headers.
 * Never rejects: a failing IndexedDB (quota, blocked) loses only the copy.
 * Skipped when clearLookups ran since `generation` was read: a lookup in
 * flight at token purge may hold private repo data.
 */
export async function saveLookup(
    kind: LookupKind,
    key: string,
    value: unknown,
    generation: number = storeGeneration,
): Promise<void> {
    if (!isLookupStoreAvailable() || generation !== storeGeneration) {
        return;
    }
    const record = { value, savedAt: new Date().toISOString() };
    await settle(() =>
        withObjectStore(LOOKUP_DB_NAME, LOOKUP_DB_STORE, "readwrite", (store) =>
            store.put(record, lookupKey(kind, key)),
        ),
    );
}

/**
 * Drops every stored lookup. With a token these include private repo data,
 * so token purge calls this. Never rejects.
 */
export async function clearLookups(): Promise<void> {
    storeGeneration++;
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
                store.get(lookupKey(kind, key)),
            ),
            delay(LOOKUP_READ_TIMEOUT_MS),
        ]),
    );
    const parsed = StoredLookupSchema.safeParse(result.ok ? result.value : undefined);
    return parsed.success ? (parsed.data as StoredLookup<T>) : undefined;
}
