import { describe, expect, it, vi } from "vitest";
import { fetchWithTimeout } from "../../../src/core/api/http";
import {
    CORE_SETTINGS_DEFAULTS,
    configureCore,
    coreRuntime,
    resetCore,
} from "../../../src/core/runtime";
import { textResponse } from "../../helpers/fetchMock";

describe("core runtime", () => {
    it("defaults to no proxy + no token + no lookup store", () => {
        resetCore();

        expect(coreRuntime().settings()).toEqual(CORE_SETTINGS_DEFAULTS);
        expect(coreRuntime().lookupStore).toBeNull();
        const subject = {};
        expect(coreRuntime().trackSubject(subject)).toBe(subject);
    });

    it("default settings reject writes", () => {
        resetCore();

        expect(() => {
            coreRuntime().settings().githubToken = "ghp_leaked";
        }).toThrow(TypeError);
        resetCore();
        expect(coreRuntime().settings().githubToken).toBeUndefined();
    });

    it("keeps parts not overridden", () => {
        resetCore();
        const trackSubject = coreRuntime().trackSubject;

        configureCore({ settings: () => ({ ...CORE_SETTINGS_DEFAULTS, proxyUrl: "p/" }) });

        expect(coreRuntime().settings().proxyUrl).toBe("p/");
        expect(coreRuntime().trackSubject).toBe(trackSubject);
    });

    it("reads settings at request time", async () => {
        let proxyUrl = "";
        configureCore({ settings: () => ({ ...CORE_SETTINGS_DEFAULTS, proxyUrl }) });
        const fetchMock = vi.fn(async () => textResponse(""));
        vi.stubGlobal("fetch", fetchMock);

        proxyUrl = "https://proxy.example/?u=";
        await fetchWithTimeout("https://registry.npmjs.org/a");

        expect(fetchMock).toHaveBeenCalledWith(
            "https://proxy.example/?u=https://registry.npmjs.org/a",
            expect.anything(),
        );
    });
});
