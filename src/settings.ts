import { reactive, watch } from "vue";
import { z } from "zod";
import { config } from "./config";
import { MAX_CONFIG_INT, STORAGE_KEY_SETTINGS } from "./constants";
import { readStoredJson, writeStoredJson } from "./utils/storage";
import { isHttpUrl } from "./utils/url";

const SettingsIntSchema = z.number().int().positive().max(MAX_CONFIG_INT);

export const SETTINGS_DEFAULTS = {
    proxyUrl: "",
    fetchTimeoutMs: config.fetchTimeoutMs,
    fetchConcurrency: config.fetchConcurrency,
};

/** Each invalid or missing field falls back to its default on its own. */
export const SettingsSchema = z
    .object({
        proxyUrl: z
            .string()
            .refine((value) => value === "" || isHttpUrl(value))
            .catch(SETTINGS_DEFAULTS.proxyUrl),
        fetchTimeoutMs: SettingsIntSchema.catch(SETTINGS_DEFAULTS.fetchTimeoutMs),
        fetchConcurrency: SettingsIntSchema.catch(SETTINGS_DEFAULTS.fetchConcurrency),
    })
    .catch(() => ({ ...SETTINGS_DEFAULTS }));

/** True for a positive integer small enough for a browser timer. */
export function isSettingsInt(value: number): boolean {
    return SettingsIntSchema.safeParse(value).success;
}

export function loadSettings(): Settings {
    return SettingsSchema.parse(readStoredJson(STORAGE_KEY_SETTINGS));
}

/** User settings, edited in the settings menu and persisted to localStorage on every change. */
export const settings = reactive(loadSettings());

watch(settings, (value) => writeStoredJson(STORAGE_KEY_SETTINGS, value), { deep: true });

export type Settings = z.infer<typeof SettingsSchema>;
