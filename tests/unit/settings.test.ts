import { describe, it, expect } from "vitest";
import { nextTick } from "vue";
import { STORAGE_KEY_SETTINGS } from "../../src/constants";
import {
    SETTINGS_DEFAULTS,
    isProxyUrl,
    loadSettings,
    resolveColorScheme,
    settings,
} from "../../src/settings";

describe("loadSettings", () => {
    it("returns defaults when nothing stored", () => {
        localStorage.removeItem(STORAGE_KEY_SETTINGS);

        expect(loadSettings()).toEqual(SETTINGS_DEFAULTS);
    });

    it("returns defaults for non-object JSON", () => {
        localStorage.setItem(STORAGE_KEY_SETTINGS, '"oops"');

        expect(loadSettings()).toEqual(SETTINGS_DEFAULTS);
    });

    it("keeps valid fields, falls back per invalid field", () => {
        localStorage.setItem(
            STORAGE_KEY_SETTINGS,
            JSON.stringify({
                proxyUrl: "javascript:alert(1)",
                fetchTimeoutMs: 1000,
                fetchConcurrency: 2.5,
                theme: "neon",
                fontScale: 1.25,
                spaceScale: 3,
            }),
        );

        expect(loadSettings()).toEqual({
            ...SETTINGS_DEFAULTS,
            fetchTimeoutMs: 1000,
            fontScale: 1.25,
        });
    });

    it("drops unknown fields", () => {
        localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify({ githubToken: "x" }));

        expect(loadSettings()).not.toHaveProperty("githubToken");
    });
});

describe("isProxyUrl", () => {
    it.each(["", "https://p.test/?u={url}"])("accepts %j", (value) => {
        expect(isProxyUrl(value)).toBe(true);
    });

    it.each([
        "javascript:alert(1)",
        "https://u:p@p.test/",
        "https://u@p.test/",
        "https://:p@p.test/",
    ])("rejects %j", (value) => {
        expect(isProxyUrl(value)).toBe(false);
    });

    it("drops stored proxy with credentials", () => {
        localStorage.setItem(
            STORAGE_KEY_SETTINGS,
            JSON.stringify({ proxyUrl: "https://u:p@p.test/" }),
        );

        expect(loadSettings().proxyUrl).toBe("");
    });
});

describe("settings", () => {
    it("persists every change as JSON", async () => {
        settings.proxyUrl = "https://proxy.example/";
        await nextTick();

        expect(JSON.parse(localStorage.getItem(STORAGE_KEY_SETTINGS))).toEqual({
            ...SETTINGS_DEFAULTS,
            proxyUrl: "https://proxy.example/",
        });
    });
});

describe("resolveColorScheme", () => {
    it.each([
        ["green", false, "dark"],
        ["green", true, "dark"],
        ["light", false, "light"],
        ["light", true, "light"],
        ["system", false, "dark"],
        ["system", true, "light"],
    ] as const)("%s theme, prefers light %s -> %s", (theme, prefersLight, expected) => {
        expect(resolveColorScheme(theme, prefersLight)).toBe(expected);
    });
});
