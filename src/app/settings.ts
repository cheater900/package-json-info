import { reactive, shallowRef, watch } from "vue";
import { z } from "zod";
import { config } from "./config";
import {
    SETTINGS_FONT_SCALES,
    SETTINGS_SPACE_SCALES,
    SETTINGS_THEMES,
    STORAGE_KEY_SETTINGS,
} from "./constants";
import { readStoredJson, writeStoredJson } from "./utils/storage";
import { isConfigInt } from "../core/utils/configInt";
import { isProxyUrl } from "../core/utils/url";

export type ColorScheme = "light" | "dark";

const SettingsIntSchema = z.number().refine(isConfigInt);

export const SETTINGS_DEFAULTS = {
    proxyUrl: "",
    fetchTimeoutMs: config.fetchTimeoutMs,
    fetchConcurrency: config.fetchConcurrency,
    theme: SETTINGS_THEMES[0],
    fontScale: 1,
    spaceScale: 1,
} as const;

/** Each invalid or missing field falls back to its default on its own. */
const SettingsSchema = z
    .object({
        proxyUrl: z.string().refine(isProxyUrl).catch(SETTINGS_DEFAULTS.proxyUrl),
        fetchTimeoutMs: SettingsIntSchema.catch(SETTINGS_DEFAULTS.fetchTimeoutMs),
        fetchConcurrency: SettingsIntSchema.catch(SETTINGS_DEFAULTS.fetchConcurrency),
        theme: z.enum(SETTINGS_THEMES).catch(SETTINGS_DEFAULTS.theme),
        fontScale: z.literal(SETTINGS_FONT_SCALES).catch(SETTINGS_DEFAULTS.fontScale),
        spaceScale: z.literal(SETTINGS_SPACE_SCALES).catch(SETTINGS_DEFAULTS.spaceScale),
    })
    .catch(() => ({ ...SETTINGS_DEFAULTS }));

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

/** Color scheme a theme renders with; "system" follows the OS preference. */
export function resolveColorScheme(theme: Settings["theme"], prefersLight: boolean): ColorScheme {
    const isLight = theme === "light" || (theme === "system" && prefersLight);
    return isLight ? "light" : "dark";
}

export type Settings = z.infer<typeof SettingsSchema>;
