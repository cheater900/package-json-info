import { describe, it, expect, vi, beforeEach } from "vitest";
import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import { STORAGE_KEY_GITHUB_TOKEN } from "../../../src/constants";
import {
    isTokenStorageAvailable,
    loadGithubToken,
    purgeGithubToken,
    saveGithubToken,
} from "../../../src/utils/githubTokenStorage";
import { settle } from "../../../src/utils/settle";

const TOKEN = "github_pat_abc123";

beforeEach(() => {
    vi.stubGlobal("indexedDB", new IDBFactory());
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

    it("purges, returns undefined for corrupt data", async () => {
        localStorage.setItem(STORAGE_KEY_GITHUB_TOKEN, '{"iv":"x"}');

        expect(await loadGithubToken()).toBeUndefined();
        expect(localStorage.getItem(STORAGE_KEY_GITHUB_TOKEN)).toBeNull();
    });

    it("purges, returns undefined for missing key", async () => {
        await saveGithubToken(TOKEN);
        vi.stubGlobal("indexedDB", new IDBFactory());

        expect(await loadGithubToken()).toBeUndefined();
        expect(localStorage.getItem(STORAGE_KEY_GITHUB_TOKEN)).toBeNull();
    });

    it("reports unavailable without IndexedDB or crypto.subtle", () => {
        expect(isTokenStorageAvailable()).toBe(true);
        vi.stubGlobal("indexedDB", undefined);
        expect(isTokenStorageAvailable()).toBe(false);
        vi.stubGlobal("indexedDB", new IDBFactory());
        vi.stubGlobal("crypto", {});
        expect(isTokenStorageAvailable()).toBe(false);
    });
});
