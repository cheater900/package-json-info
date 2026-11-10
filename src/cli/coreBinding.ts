import { configureCore, CORE_SETTINGS_DEFAULTS } from "../core/runtime";
import type { CoreSettings } from "../core/runtime";
import { readPositiveInt } from "../core/utils/configInt";
import { isProxyUrl } from "../core/utils/url";
import { createFileLookupStore, defaultLookupCacheDir } from "./fileLookupStore";

/** Raw flag values; undefined = flag not given. */
export type CoreSettingsInput = {
    proxyUrl?: string;
    timeout?: string;
    concurrency?: string;
    /** False (`--no-cache`) plugs no offline lookup store. */
    cache?: boolean;
};

const ENV_PROXY_URL = "PJI_PROXY_URL";
const ENV_FETCH_TIMEOUT_MS = "PJI_FETCH_TIMEOUT_MS";
const ENV_FETCH_CONCURRENCY = "PJI_FETCH_CONCURRENCY";
const ENV_GITHUB_TOKEN = "GITHUB_TOKEN";

/** Name + raw value of one setting source; the name labels the warning for an invalid value. */
type SettingSource = [name: string, raw: string | undefined];

/**
 * Resolves core settings once (flag > env > default), plugs them and the file
 * lookup store into core and returns them, or returns the error message for
 * an invalid proxy URL. The token comes from env only; no message ever
 * contains it.
 */
export function bindCore(input: CoreSettingsInput, env: NodeJS.ProcessEnv): CoreSettings | string {
    const proxyUrl = input.proxyUrl ?? env[ENV_PROXY_URL] ?? CORE_SETTINGS_DEFAULTS.proxyUrl;
    if (!isProxyUrl(proxyUrl)) {
        return "Invalid proxy URL: expected an http(s) URL without user:pass@.";
    }
    const settings: CoreSettings = {
        proxyUrl,
        fetchTimeoutMs: readIntSetting(
            ["--timeout", input.timeout],
            [ENV_FETCH_TIMEOUT_MS, env[ENV_FETCH_TIMEOUT_MS]],
            CORE_SETTINGS_DEFAULTS.fetchTimeoutMs,
        ),
        fetchConcurrency: readIntSetting(
            ["--concurrency", input.concurrency],
            [ENV_FETCH_CONCURRENCY, env[ENV_FETCH_CONCURRENCY]],
            CORE_SETTINGS_DEFAULTS.fetchConcurrency,
        ),
        githubToken: env[ENV_GITHUB_TOKEN] || undefined,
    };
    const lookupStore =
        input.cache === false ? null : createFileLookupStore(defaultLookupCacheDir(env));
    configureCore({ settings: () => settings, lookupStore });
    return settings;
}

/** Flag value when given (an invalid one falls back to `fallback`, not env), else env value. */
function readIntSetting(flag: SettingSource, envVar: SettingSource, fallback: number): number {
    const [name, raw] = flag[1] !== undefined ? flag : envVar;
    return readPositiveInt(name, raw, fallback);
}
