import { z } from "zod";
import {
    STORAGE_KEY_GITHUB_TOKEN,
    TOKEN_CIPHER,
    TOKEN_DB_KEY,
    TOKEN_DB_NAME,
    TOKEN_DB_STORE,
    TOKEN_IV_BYTES,
} from "../constants";
import { withObjectStore } from "./indexedDb";
import { settle } from "../../core/utils/settle";
import { readStoredJson, removeStoredJson } from "./storage";

const StoredTokenSchema = z.object({
    iv: z.array(z.number()),
    data: z.array(z.number()),
});

/**
 * True when the browser can encrypt and keep the token: IndexedDB for the
 * key, `crypto.subtle` for AES (missing outside secure contexts).
 */
export function isTokenStorageAvailable(): boolean {
    return typeof indexedDB !== "undefined" && globalThis.crypto?.subtle != null;
}

function withKeyStore<T>(
    mode: IDBTransactionMode,
    use: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
    return withObjectStore(TOKEN_DB_NAME, TOKEN_DB_STORE, mode, use);
}

/**
 * Encrypts the token with a fresh non-extractable AES-GCM key kept in
 * IndexedDB; only IV and ciphertext reach localStorage. This keeps the
 * token out of plain-text profile files, not away from scripts on the page.
 * Rejects when storage or crypto fails.
 */
export async function saveGithubToken(token: string): Promise<void> {
    const key = await crypto.subtle.generateKey(TOKEN_CIPHER, false, ["encrypt", "decrypt"]);
    const iv = crypto.getRandomValues(new Uint8Array(TOKEN_IV_BYTES));
    const data = await crypto.subtle.encrypt(
        { name: TOKEN_CIPHER.name, iv },
        key,
        new TextEncoder().encode(token),
    );
    await withKeyStore("readwrite", (store) => store.put(key, TOKEN_DB_KEY));
    localStorage.setItem(
        STORAGE_KEY_GITHUB_TOKEN,
        JSON.stringify({ iv: [...iv], data: [...new Uint8Array(data)] }),
    );
}

/** Deletes the encrypted token and its key. Never rejects. */
export async function purgeGithubToken(): Promise<void> {
    removeStoredJson(STORAGE_KEY_GITHUB_TOKEN);
    if (!isTokenStorageAvailable()) {
        return;
    }
    await settle(() => withKeyStore("readwrite", (store) => store.delete(TOKEN_DB_KEY)));
}

/**
 * Decrypts the stored token. Undefined when none is stored or storage is
 * unavailable. Corrupt data or a lost key purges the token; a failing
 * IndexedDB keeps it for the next load. Never rejects.
 */
export async function loadGithubToken(): Promise<string | undefined> {
    const stored = readStoredJson(STORAGE_KEY_GITHUB_TOKEN);
    if (stored === undefined || !isTokenStorageAvailable()) {
        return undefined;
    }
    const keyResult = await settle(() =>
        withKeyStore("readonly", (store) => store.get(TOKEN_DB_KEY)),
    );
    const isIndexedDbFailing = !keyResult.ok;
    if (isIndexedDbFailing) {
        return undefined;
    }
    const result = await settle(async () => {
        const { iv, data } = StoredTokenSchema.parse(stored);
        const plain = await crypto.subtle.decrypt(
            { name: TOKEN_CIPHER.name, iv: new Uint8Array(iv) },
            keyResult.value,
            new Uint8Array(data),
        );
        return new TextDecoder().decode(plain);
    });
    if (result.ok) {
        return result.value;
    }
    await purgeGithubToken();
    return undefined;
}
