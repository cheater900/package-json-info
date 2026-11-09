import { LOOKUP_DB_NAME, LOOKUP_DB_STORE, LOOKUP_READ_TIMEOUT_MS } from "../constants";
import { delay } from "../../core/utils/delay";
import { lookupKey, StoredLookupSchema } from "../../core/utils/memoizeLookup";
import type { LookupKind, LookupStore, StoredLookup } from "../../core/utils/memoizeLookup";
import { settle } from "../../core/utils/settle";
import { withObjectStore } from "./indexedDb";

// Bumped by clearLookups; a lookup started before a clear must not save after it.
let storeGeneration = 0;

/** Pass to saveLookup, read when the lookup starts. */
export function lookupStoreGeneration(): number {
    return storeGeneration;
}

function isLookupStoreAvailable(): boolean {
    return typeof indexedDB !== "undefined";
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

/** IndexedDB copy of last good lookups, plugged into core by bindCore. */
export const indexedDbLookupStore: LookupStore = {
    load: loadLookup,
    save: saveLookup,
    generation: lookupStoreGeneration,
};
