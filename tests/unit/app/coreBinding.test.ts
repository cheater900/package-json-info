import { afterEach, describe, it, expect } from "vitest";
import { isReactive } from "vue";
import { coreRuntime } from "../../../src/core/runtime";
import { githubToken, settings } from "../../../src/app/settings";
import { loadLookup, lookupStoreGeneration, saveLookup } from "../../../src/app/utils/lookupStore";
import { resetSettings } from "../../helpers/settings";

describe("bindCore", () => {
    afterEach(resetSettings);

    it("feeds live app settings + token to core", () => {
        settings.proxyUrl = "https://p.test/";
        settings.fetchTimeoutMs = 1234;
        settings.fetchConcurrency = 3;
        githubToken.value = "abc";

        expect(coreRuntime().settings()).toEqual({
            proxyUrl: "https://p.test/",
            fetchTimeoutMs: 1234,
            fetchConcurrency: 3,
            githubToken: "abc",
        });
    });

    it("makes request subjects reactive for network log", () => {
        expect(isReactive(coreRuntime().trackSubject({ columns: new Set() }))).toBe(true);
    });

    it("plugs IndexedDB lookup store", () => {
        expect(coreRuntime().lookupStore).toEqual({
            load: loadLookup,
            save: saveLookup,
            generation: lookupStoreGeneration,
        });
    });
});
