import type { LookupKind, LookupStore, StoredLookup } from "../../src/core/utils/memoizeLookup";
import { lookupKey } from "../../src/core/utils/memoizeLookup";

export type FakeLookupStore = LookupStore & {
    /** Everything saved so far, by lookupKey. */
    entries: Map<string, StoredLookup<unknown>>;
    /** Drops entries and invalidates lookups started before, like the app store. */
    clear: () => void;
    /** Stores `value` as if fetched live at `savedAt`. */
    seed: (kind: LookupKind, key: string, value: unknown, savedAt: string) => void;
};

/** In-memory LookupStore with the app store's generation semantics; keeps core tests free of app code. */
export function fakeLookupStore(): FakeLookupStore {
    const entries = new Map<string, StoredLookup<unknown>>();
    let generation = 0;
    return {
        entries,
        generation: () => generation,
        load: async <T>(kind: LookupKind, key: string) =>
            entries.get(lookupKey(kind, key)) as StoredLookup<T> | undefined,
        save: async (kind, key, value, savedGeneration) => {
            if (savedGeneration !== generation) {
                return;
            }
            entries.set(lookupKey(kind, key), { value, savedAt: new Date().toISOString() });
        },
        clear: () => {
            generation++;
            entries.clear();
        },
        seed: (kind, key, value, savedAt) => {
            entries.set(lookupKey(kind, key), { value, savedAt });
        },
    };
}
