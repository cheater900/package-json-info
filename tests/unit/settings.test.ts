import { describe, it, expect } from "vitest";
import { nextTick } from "vue";
import { STORAGE_KEY_SETTINGS } from "../../src/constants";
import {
    SETTINGS_DEFAULTS,
    isProxyUrl,
    isSettingsInt,
    loadSettings,
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
    it("accepts empty and http(s) url, rejects other scheme and credentials", () => {
        expect(isProxyUrl("")).toBe(true);
        expect(isProxyUrl("https://p.test/?u={url}")).toBe(true);
        for (const value of ["javascript:alert(1)", "https://u:p@p.test/", "https://u@p.test/"]) {
            expect(isProxyUrl(value)).toBe(false);
        }
    });

    it("drops stored proxy with credentials", () => {
        localStorage.setItem(
            STORAGE_KEY_SETTINGS,
            JSON.stringify({ proxyUrl: "https://u:p@p.test/" }),
        );

        expect(loadSettings().proxyUrl).toBe("");
    });
});

describe("isSettingsInt", () => {
    it("accepts positive int up to 2^31-1 only", () => {
        expect(isSettingsInt(1)).toBe(true);
        expect(isSettingsInt(2 ** 31 - 1)).toBe(true);
        for (const value of [0, -1, 1.5, 2 ** 31, Number.NaN]) {
            expect(isSettingsInt(value)).toBe(false);
        }
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
