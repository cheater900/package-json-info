/**
 * Caches in-flight/completed promises by key, so concurrent callers share
 * one request. A rejected promise is evicted so the next call retries.
 */
export function memoizeAsync<T>(
    cache: Map<string, Promise<T>>,
    key: string,
    fn: () => Promise<T>,
): Promise<T> {
    const cached = cache.get(key);
    if (cached) {
        return cached;
    }
    const request = fn();
    cache.set(key, request);
    // Only evict this request: after a cache clear, the key may hold a newer one.
    request.catch(() => {
        if (cache.get(key) === request) {
            cache.delete(key);
        }
    });
    return request;
}
