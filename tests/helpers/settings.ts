import { vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { SETTINGS_DEFAULTS, githubToken, settings } from "../../src/settings";

/** Fresh empty fake IndexedDB; jsdom has none. */
export function stubIndexedDb() {
    vi.stubGlobal("indexedDB", new IDBFactory());
}

/** Restores module-global settings and drops the in-memory token. */
export function resetSettings() {
    githubToken.value = undefined;
    Object.assign(settings, SETTINGS_DEFAULTS);
}
