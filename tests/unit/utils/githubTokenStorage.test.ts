import { describe, it, expect, vi, beforeEach } from "vitest";
import { IDBObjectStore } from "fake-indexeddb";
import { STORAGE_KEY_GITHUB_TOKEN } from "../../../src/constants";
import {
    isTokenStorageAvailable,
    loadGithubToken,
    purgeGithubToken,
    saveGithubToken,
} from "../../../src/utils/githubTokenStorage";
import { settle } from "../../../src/utils/settle";
import { stubIndexedDb } from "../../helpers/settings";
import { githubTokenFixture as TOKEN } from "../../fixtures/github";

beforeEach(() => {
    stubIndexedDb();
    localStorage.clear();
});

describe("githubTokenStorage", () => {
    it("round-trips token through save and load", async () => {
        await saveGithubToken(TOKEN);

        expect(await loadGithubToken()).toBe(TOKEN);
    });

    it("keeps no plaintext in localStorage", async () => {
        await saveGithubToken(TOKEN);

        const stored = localStorage.getItem(STORAGE_KEY_GITHUB_TOKEN);
        expect(stored).toBeTruthy();
        expect(stored).not.toContain(TOKEN);
    });

    it("generates non-extractable key", async () => {
        const generateKey = vi.spyOn(crypto.subtle, "generateKey");

        await saveGithubToken(TOKEN);

        expect(generateKey).toHaveBeenCalledWith(expect.anything(), false, expect.anything());
    });

    it("save rejects, writes no ciphertext when key commit aborts", async () => {
        const put = IDBObjectStore.prototype.put;
        vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (
            this: IDBObjectStore,
            ...args: Parameters<typeof put>
        ) {
            const request = put.apply(this, args);
            request.addEventListener("success", () => this.transaction.abort());
            return request;
        });

        const result = await settle(() => saveGithubToken(TOKEN));

        expect(result.ok).toBe(false);
        expect(localStorage.getItem(STORAGE_KEY_GITHUB_TOKEN)).toBeNull();
    });

    it("returns undefined when nothing stored", async () => {
        expect(await loadGithubToken()).toBeUndefined();
    });

    it("purge clears localStorage and key", async () => {
        await saveGithubToken(TOKEN);
        const stored = localStorage.getItem(STORAGE_KEY_GITHUB_TOKEN);

        await purgeGithubToken();

        expect(localStorage.getItem(STORAGE_KEY_GITHUB_TOKEN)).toBeNull();
        localStorage.setItem(STORAGE_KEY_GITHUB_TOKEN, stored);
        expect(await loadGithubToken()).toBeUndefined();
    });

    it("purge clears ciphertext without IndexedDB", async () => {
        await saveGithubToken(TOKEN);
        vi.stubGlobal("indexedDB", undefined);

        await purgeGithubToken();

        expect(localStorage.getItem(STORAGE_KEY_GITHUB_TOKEN)).toBeNull();
    });

    it("purge resolves when localStorage and IndexedDB throw", async () => {
        vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
            throw new DOMException("denied", "SecurityError");
        });
        vi.spyOn(indexedDB, "open").mockImplementation(() => {
            throw new DOMException("lost", "UnknownError");
        });

        await expect(purgeGithubToken()).resolves.toBeUndefined();
    });

    it("load keeps ciphertext, returns undefined without IndexedDB", async () => {
        await saveGithubToken(TOKEN);
        const stored = localStorage.getItem(STORAGE_KEY_GITHUB_TOKEN);
        vi.stubGlobal("indexedDB", undefined);

        expect(await loadGithubToken()).toBeUndefined();
        expect(localStorage.getItem(STORAGE_KEY_GITHUB_TOKEN)).toBe(stored);
    });

    it("purges, returns undefined for wrong IV", async () => {
        await saveGithubToken(TOKEN);
        const stored = JSON.parse(localStorage.getItem(STORAGE_KEY_GITHUB_TOKEN)!);
        stored.iv[0] ^= 1;
        localStorage.setItem(STORAGE_KEY_GITHUB_TOKEN, JSON.stringify(stored));

        expect(await loadGithubToken()).toBeUndefined();
        expect(localStorage.getItem(STORAGE_KEY_GITHUB_TOKEN)).toBeNull();
    });

    it("purges, returns undefined for corrupt data", async () => {
        localStorage.setItem(STORAGE_KEY_GITHUB_TOKEN, '{"iv":"x"}');

        expect(await loadGithubToken()).toBeUndefined();
        expect(localStorage.getItem(STORAGE_KEY_GITHUB_TOKEN)).toBeNull();
    });

    it("purges, returns undefined for missing key", async () => {
        await saveGithubToken(TOKEN);
        stubIndexedDb();

        expect(await loadGithubToken()).toBeUndefined();
        expect(localStorage.getItem(STORAGE_KEY_GITHUB_TOKEN)).toBeNull();
    });

    it("keeps token when IndexedDB open fails", async () => {
        await saveGithubToken(TOKEN);
        const stored = localStorage.getItem(STORAGE_KEY_GITHUB_TOKEN);
        vi.spyOn(indexedDB, "open").mockImplementation(() => {
            throw new DOMException("Connection to Indexed Database server lost", "UnknownError");
        });

        expect(await loadGithubToken()).toBeUndefined();
        expect(localStorage.getItem(STORAGE_KEY_GITHUB_TOKEN)).toBe(stored);
        vi.mocked(indexedDB.open).mockRestore();
        expect(await loadGithubToken()).toBe(TOKEN);
    });

    it("reports unavailable without IndexedDB or crypto.subtle", () => {
        expect(isTokenStorageAvailable()).toBe(true);
        vi.stubGlobal("indexedDB", undefined);
        expect(isTokenStorageAvailable()).toBe(false);
        stubIndexedDb();
        vi.stubGlobal("crypto", {});
        expect(isTokenStorageAvailable()).toBe(false);
    });
});
