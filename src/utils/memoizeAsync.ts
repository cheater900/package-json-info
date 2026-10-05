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
    request.catch(() => cache.delete(key));
    return request;
}
