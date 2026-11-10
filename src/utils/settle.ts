export type Settled<T> = { ok: true; value: T } | { ok: false; error: Error };

/**
 * Runs `task` and reports its outcome as a value instead of a throw, so a
 * caller can first check whether the result is still wanted, then branch.
 */
export async function settle<T>(task: () => Promise<T>): Promise<Settled<T>> {
    try {
        return { ok: true, value: await task() };
    } catch (error) {
        return { ok: false, error: error instanceof Error ? error : new Error(String(error)) };
    }
}
