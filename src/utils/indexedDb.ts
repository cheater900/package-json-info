/** Resolves with the request's result once it succeeds, rejects with its error. */
function requestResult<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Resolves once the transaction commits. A write is durable only then:
 * quota or disk errors abort the transaction after its request succeeded.
 */
function transactionCommitted(transaction: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(transaction.error);
    });
}

/**
 * Opens `dbName` (creating `storeName` on first use), runs one request on
 * the store and resolves with its result after the transaction commits.
 * Closes the connection either way.
 */
export async function withObjectStore<T>(
    dbName: string,
    storeName: string,
    mode: IDBTransactionMode,
    use: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
    const openRequest = indexedDB.open(dbName);
    openRequest.onupgradeneeded = () => openRequest.result.createObjectStore(storeName);
    const db = await requestResult(openRequest);
    try {
        const transaction = db.transaction(storeName, mode);
        const [result] = await Promise.all([
            requestResult(use(transaction.objectStore(storeName))),
            transactionCommitted(transaction),
        ]);
        return result;
    } finally {
        db.close();
    }
}
