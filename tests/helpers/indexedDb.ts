import { vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";

/** Fresh empty fake IndexedDB; jsdom and Node have none. */
export function stubIndexedDb() {
    vi.stubGlobal("indexedDB", new IDBFactory());
}
