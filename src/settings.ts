import { reactive, shallowRef, watch } from "vue";
import { z } from "zod";
import { config } from "./config";
import {
    MAX_CONFIG_INT,
    SETTINGS_FONT_SCALES,
    SETTINGS_SPACE_SCALES,
    SETTINGS_THEMES,
    STORAGE_KEY_SETTINGS,
} from "./constants";
import { readStoredJson, writeStoredJson } from "./utils/storage";
import { isHttpUrl } from "./utils/url";

const SettingsIntSchema = z.number().int().positive().max(MAX_CONFIG_INT);

export const SETTINGS_DEFAULTS = {
    proxyUrl: "",
    fetchTimeoutMs: config.fetchTimeoutMs,
    fetchConcurrency: config.fetchConcurrency,
    theme: SETTINGS_THEMES[0],
    fontScale: 1,
    spaceScale: 1,
} as const;

/** Each invalid or missing field falls back to its default on its own. */
export const SettingsSchema = z
    .object({
        proxyUrl: z
            .string()
            .refine((value) => value === "" || isHttpUrl(value))
            .catch(SETTINGS_DEFAULTS.proxyUrl),
        fetchTimeoutMs: SettingsIntSchema.catch(SETTINGS_DEFAULTS.fetchTimeoutMs),
        fetchConcurrency: SettingsIntSchema.catch(SETTINGS_DEFAULTS.fetchConcurrency),
        theme: z.enum(SETTINGS_THEMES).catch(SETTINGS_DEFAULTS.theme),
        fontScale: z.literal(SETTINGS_FONT_SCALES).catch(SETTINGS_DEFAULTS.fontScale),
        spaceScale: z.literal(SETTINGS_SPACE_SCALES).catch(SETTINGS_DEFAULTS.spaceScale),
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

/**
 * Decrypted GitHub token, memory only; `githubTokenStorage` keeps it
 * encrypted at rest. Never persisted with `settings`, never logged.
 */
export const githubToken = shallowRef<string | undefined>();

export type Settings = z.infer<typeof SettingsSchema>;
