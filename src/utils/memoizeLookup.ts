import type { ZodType } from "zod";
import { loadLookup, lookupStoreGeneration, saveLookup } from "./lookupStore";
import type { LookupKind } from "./lookupStore";
import { memoizeAsync } from "./memoizeAsync";

/** One lookup's answer. `staleSince` is the save time of a stored value used after the live fetch failed, else null. */
export type Lookup<T> = {
    value: T;
    staleSince: string | null;
};

export function fresh<T>(value: T): Lookup<T> {
    return { value, staleSince: null };
}

/** Oldest save time among stale lookups; null when all were live. ISO timestamps sort as text. */
export function oldestStaleSince(lookups: Lookup<unknown>[]): string | null {
    return (
        lookups
            .map((lookup) => lookup.staleSince)
            .filter((staleSince) => staleSince != null)
            .sort()[0] ?? null
    );
}

/**
 * memoizeAsync backed by the offline store. A live answer (`null` included:
 * 404 means "no data") is saved and returned fresh. When the live fetch
 * fails, the last saved answer is returned as stale and evicted from
 * `cache`, so the next fetch retries live; callers already waiting share
 * it. `storedSchema` checks the saved answer, since another app version may
 * have saved another shape; without a saved answer passing it the live
 * error is thrown unchanged. Nothing is saved when clearLookups ran meanwhile.
 */
export function memoizeLookup<T>(
    cache: Map<string, Promise<Lookup<T>>>,
    kind: LookupKind,
    key: string,
    storedSchema: ZodType<T>,
    fetchLive: () => Promise<T>,
): Promise<Lookup<T>> {
    const request: Promise<Lookup<T>> = memoizeAsync(cache, key, async () => {
        const generation = lookupStoreGeneration();
        let value: T;
        try {
            value = await fetchLive();
        } catch (error) {
            const stored = await loadLookup<unknown>(kind, key);
            const parsed = storedSchema.safeParse(stored?.value);
            if (!stored || !parsed.success) {
                throw error;
            }
            const isStillCached = cache.get(key) === request;
            if (isStillCached) {
                cache.delete(key);
            }
            return { value: parsed.data, staleSince: stored.savedAt };
        }
        // Not awaited: a slow or hanging IndexedDB must not delay the row.
        void saveLookup(kind, key, value, generation);
        return fresh(value);
    });
    return request;
}
