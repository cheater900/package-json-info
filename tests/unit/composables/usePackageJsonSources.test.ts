import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ref, nextTick, effectScope } from "vue";
import { usePackageJsonSources } from "../../../src/composables/usePackageJsonSources";
import { URL_SYNC_DEBOUNCE_MS } from "../../../src/constants";
import { jsonResponse } from "../../helpers/fetchMock";

const HTTP_SERVER_ERROR = 500;

function setup() {
    const loadPackageJsonText = vi.fn();
    const loadError = ref(null);
    const scope = effectScope();
    const sources = scope.run(() => usePackageJsonSources(loadPackageJsonText, loadError));
    return { ...sources, loadPackageJsonText, loadError, scope };
}

beforeEach(() => {
    vi.unstubAllGlobals();
    window.history.replaceState(null, "", "/");
});

afterEach(() => {
    vi.useRealTimers();
});

describe("load ordering", () => {
    it("drops slow URL result once newer drill-down finished", async () => {
        let resolveSlow;
        vi.stubGlobal(
            "fetch",
            vi.fn((url: string) => {
                if (url.includes("slow.example")) {
                    return new Promise((resolve) => {
                        resolveSlow = resolve;
                    });
                }
                return Promise.resolve(
                    jsonResponse({
                        "dist-tags": { latest: "1.0.0" },
                        versions: { "1.0.0": { name: "dep" } },
                    }),
                );
            }),
        );
        const { urlInput, loadFromUrlInput, loadDependency, loadPackageJsonText, isLoadingInput } =
            setup();
        urlInput.value = "https://slow.example/package.json";

        const slowLoad = loadFromUrlInput();
        await loadDependency({ name: "dep", version: "1.0.0" });
        resolveSlow(jsonResponse(null));
        await slowLoad;

        expect(loadPackageJsonText).toHaveBeenCalledTimes(1);
        expect(loadPackageJsonText.mock.calls[0][0]).toContain('"name": "dep"');
        expect(isLoadingInput.value).toBe(false);
    });
});

describe("loadFromUrlInput", () => {
    it("surfaces request failure message", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => ({ ok: false, status: HTTP_SERVER_ERROR })),
        );
        const { urlInput, loadFromUrlInput, loadError, isLoadingInput } = setup();
        urlInput.value = "https://example.com/package.json";

        await loadFromUrlInput();

        expect(loadError.value).toContain(String(HTTP_SERVER_ERROR));
        expect(isLoadingInput.value).toBe(false);
    });
});

describe("loadFromClipboard", () => {
    it("shows clipboard error without clipboard API", async () => {
        vi.stubGlobal("navigator", {});
        const { loadFromClipboard, loadError } = setup();

        await loadFromClipboard();

        expect(loadError.value).toContain("Could not read the clipboard");
    });

    it("shows empty-clipboard error for empty text", async () => {
        vi.stubGlobal("navigator", { clipboard: { readText: async () => "" } });
        const { loadFromClipboard, loadError, loadPackageJsonText } = setup();

        await loadFromClipboard();

        expect(loadError.value).toBe("The clipboard is empty.");
        expect(loadPackageJsonText).not.toHaveBeenCalled();
    });
});

describe("URL query sync", () => {
    it("writes address bar once after typing pauses", async () => {
        vi.useFakeTimers();
        const replaceState = vi.spyOn(window.history, "replaceState");
        const { urlInput } = setup();

        for (const value of ["h", "ht", "https://a.example"]) {
            urlInput.value = value;
            await nextTick();
        }
        vi.advanceTimersByTime(URL_SYNC_DEBOUNCE_MS);

        expect(replaceState).toHaveBeenCalledTimes(1);
        expect(window.location.search).toBe("?inputUrl=https%3A%2F%2Fa.example");
        replaceState.mockRestore();
    });

    it("cancels pending sync on scope dispose", async () => {
        vi.useFakeTimers();
        const replaceState = vi.spyOn(window.history, "replaceState");
        const { urlInput, scope } = setup();
        urlInput.value = "https://a.example";
        await nextTick();

        scope.stop();
        vi.advanceTimersByTime(URL_SYNC_DEBOUNCE_MS);

        expect(replaceState).not.toHaveBeenCalled();
        replaceState.mockRestore();
    });
});
