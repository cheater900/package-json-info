import { DEFAULT_FETCH_CONCURRENCY, DEFAULT_FETCH_TIMEOUT_MS } from "./constants";
import type { LookupStore } from "./utils/memoizeLookup";

/** Settings core reads at call time; the host app owns where they live. */
export type CoreSettings = {
    /** CORS proxy template; "" = no proxy. */
    proxyUrl: string;
    fetchTimeoutMs: number;
    fetchConcurrency: number;
    githubToken: string | undefined;
};

/**
 * What the host app plugs into core. `trackSubject` wraps each request
 * subject before core mutates it, so a UI can watch it grow.
 */
export type CoreRuntime = {
    settings: () => CoreSettings;
    trackSubject: <T extends object>(subject: T) => T;
    lookupStore: LookupStore | null;
};

export const CORE_SETTINGS_DEFAULTS: CoreSettings = {
    proxyUrl: "",
    fetchTimeoutMs: DEFAULT_FETCH_TIMEOUT_MS,
    fetchConcurrency: DEFAULT_FETCH_CONCURRENCY,
    githubToken: undefined,
};

const RUNTIME_DEFAULTS: CoreRuntime = {
    settings: () => CORE_SETTINGS_DEFAULTS,
    trackSubject: (subject) => subject,
    lookupStore: null,
};

let runtime = RUNTIME_DEFAULTS;

/** Replaces the given parts; the rest keep their current value. */
export function configureCore(overrides: Partial<CoreRuntime>): void {
    runtime = { ...runtime, ...overrides };
}

/** Back to defaults: no proxy, no token, no lookup store. */
export function resetCore(): void {
    runtime = RUNTIME_DEFAULTS;
}

export function coreRuntime(): CoreRuntime {
    return runtime;
}
