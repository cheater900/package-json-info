import type { ZodType } from "zod";
import { coreRuntime } from "../runtime";
import { memoizeAsync } from "./memoizeAsync";
import { settle } from "./settle";

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

/**
 * Offline copy of last good lookup answers. `generation` is read when a
 * lookup starts and passed to `save`, so a store cleared meanwhile skips it.
 * The host supplies it, so a rejecting `load` counts as nothing stored and
 * a rejecting `save` loses only the copy.
 */
export type LookupStore = {
    load: <T>(kind: LookupKind, key: string) => Promise<StoredLookup<T> | undefined>;
    save: (kind: LookupKind, key: string, value: unknown, generation: number) => Promise<void>;
    generation: () => number;
};

/** One lookup's answer. `staleSince` is the save time of a stored value used after the live fetch failed, else null. */
export type Lookup<T> = {
    value: T;
    staleSince: string | null;
};

/** Identity of lookup `kind` for `key`, shared by the store and in-memory maps. */
export function lookupKey(kind: LookupKind, key: string): string {
    return `${kind}:${key}`;
}

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
 * memoizeAsync backed by the core runtime's offline store, if any. A live
 * answer (`null` included: 404 means "no data") is saved and returned
 * fresh. When the live fetch fails, the last saved answer is returned as
 * stale and evicted from `cache`, so the next fetch retries live; callers
 * already waiting share it. `storedSchema` checks the saved answer, since
 * another app version may have saved another shape; without a saved answer
 * passing it the live error is thrown unchanged. Nothing is saved when the
 * store was cleared meanwhile.
 */
export function memoizeLookup<T>(
    cache: Map<string, Promise<Lookup<T>>>,
    kind: LookupKind,
    key: string,
    storedSchema: ZodType<T>,
    fetchLive: () => Promise<T>,
): Promise<Lookup<T>> {
    const request: Promise<Lookup<T>> = memoizeAsync(cache, key, async () => {
        const store = coreRuntime().lookupStore;
        const generation = store?.generation() ?? 0;
        let value: T;
        try {
            value = await fetchLive();
        } catch (error) {
            const loaded = store && (await settle(() => store.load<unknown>(kind, key)));
            const stored = loaded && loaded.ok ? loaded.value : undefined;
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
        // Not awaited: a slow or hanging store must not delay the row.
        if (store) {
            void settle(() => store.save(kind, key, value, generation));
        }
        return fresh(value);
    });
    return request;
}
