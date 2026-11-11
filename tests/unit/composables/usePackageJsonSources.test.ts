import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ref, nextTick, effectScope } from "vue";
import { usePackageJsonSources } from "../../../src/composables/usePackageJsonSources";
import { URL_SYNC_DEBOUNCE_MS } from "../../../src/constants";
import { clearPackageInfoCache } from "../../../src/api/npmPackage";
import { jsonResponse, HTTP_STATUS, statusResponse, textResponse } from "../../helpers/fetchMock";
import {
    githubTreeBody,
    monorepoRef,
    monorepoRootJson,
    rootWorkspaceContext,
} from "../../fixtures/workspaces";

const PACKAGE_JSON = '{"name":"x"}';
const MONOREPO_URL = "https://github.com/o/r";
const MONOREPO_SOURCE = { kind: "url", url: MONOREPO_URL };

/** Bare `change` event: the composable reads only `target`. */
function changeEvent(target: object) {
    return { target } as unknown as Event;
}

function setup() {
    const loadPackageJsonText = vi.fn<(text: string, ...rest: unknown[]) => boolean>(() => true);
    const loadError = ref<string | null>(null);
    const scope = effectScope();
    const sources = scope.run(() => usePackageJsonSources(loadPackageJsonText, loadError))!;
    return { ...sources, loadPackageJsonText, loadError, scope };
}

beforeEach(() => {
    window.history.replaceState(null, "", "/");
    clearPackageInfoCache();
});

afterEach(() => {
    vi.useRealTimers();
});

describe("load ordering", () => {
    it("drops slow URL result once newer drill-down finished", async () => {
        let resolveSlow: (response: unknown) => void;
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
        resolveSlow!(jsonResponse(null));
        await slowLoad;

        expect(loadPackageJsonText).toHaveBeenCalledTimes(1);
        expect(loadPackageJsonText.mock.calls[0][0]).toContain('"name": "dep"');
        expect(isLoadingInput.value).toBe(false);
    });
});

describe("loadFromUrlInput", () => {
    it("shows error for blank URL without fetching", async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);
        const { urlInput, loadFromUrlInput, loadError } = setup();
        urlInput.value = "   ";

        await loadFromUrlInput();

        expect(loadError.value).toBe("Enter a URL first.");
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it.each(["example.com/package.json", "ftp://example.com/package.json"])(
        "rejects non-http URL %s without fetching",
        async (url) => {
            const fetchMock = vi.fn();
            vi.stubGlobal("fetch", fetchMock);
            const { urlInput, loadFromUrlInput, loadError } = setup();
            urlInput.value = url;

            await loadFromUrlInput();

            expect(loadError.value).toBe("Enter a full URL starting with http:// or https://.");
            expect(fetchMock).not.toHaveBeenCalled();
        },
    );

    it("resolves repo host URL through raw file host", async () => {
        const fetchMock = vi.fn(async (_url: string) => textResponse(PACKAGE_JSON));
        vi.stubGlobal("fetch", fetchMock);
        const { urlInput, loadFromUrlInput, loadPackageJsonText } = setup();
        urlInput.value = "  https://github.com/o/r  ";

        await loadFromUrlInput();

        expect(fetchMock.mock.calls[0][0]).toBe(
            "https://raw.githubusercontent.com/o/r/main/package.json",
        );
        expect(loadPackageJsonText).toHaveBeenCalledWith(PACKAGE_JSON, null, MONOREPO_SOURCE);
    });

    it.each([
        ["repo without package.json", "https://github.com/o/r", statusResponse(404)],
        ["empty response body", "https://example.com/package.json", textResponse("")],
    ])("shows not-found error for %s", async (_case, url, response) => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => response),
        );
        const { urlInput, loadFromUrlInput, loadError, loadPackageJsonText } = setup();
        urlInput.value = url;

        await loadFromUrlInput();

        expect(loadError.value).toBe("Could not find a package.json at that URL.");
        expect(loadPackageJsonText).not.toHaveBeenCalled();
    });

    it("clears previous error, flags loading until fetch settles", async () => {
        let answer: (response: unknown) => void;
        vi.stubGlobal(
            "fetch",
            vi.fn(
                () =>
                    new Promise((resolve) => {
                        answer = resolve;
                    }),
            ),
        );
        const { urlInput, loadFromUrlInput, loadError, isLoadingInput } = setup();
        loadError.value = "old error";
        urlInput.value = "https://example.com/package.json";

        const load = loadFromUrlInput();

        expect(loadError.value).toBeNull();
        expect(isLoadingInput.value).toBe(true);
        answer!(textResponse(PACKAGE_JSON));
        await load;
        expect(isLoadingInput.value).toBe(false);
    });

    it("surfaces request failure message", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => statusResponse(HTTP_STATUS.serverError)),
        );
        const { urlInput, loadFromUrlInput, loadError, isLoadingInput } = setup();
        urlInput.value = "https://example.com/package.json";

        await loadFromUrlInput();

        expect(loadError.value).toContain(String(HTTP_STATUS.serverError));
        expect(isLoadingInput.value).toBe(false);
    });
});

describe("workspaces", () => {
    function stubMonorepo() {
        const fetchMock = vi.fn(async (url: string) => {
            if (url.includes("/git/trees/")) {
                return jsonResponse(githubTreeBody(rootWorkspaceContext.paths));
            }
            return textResponse(
                url.endsWith("/main/package.json") ? monorepoRootJson : PACKAGE_JSON,
            );
        });
        vi.stubGlobal("fetch", fetchMock);
        return fetchMock;
    }

    it("passes workspace list for GitHub monorepo URL", async () => {
        stubMonorepo();
        const { urlInput, loadFromUrlInput, loadPackageJsonText } = setup();
        urlInput.value = "https://github.com/o/r";

        await loadFromUrlInput();

        expect(loadPackageJsonText).toHaveBeenCalledWith(
            monorepoRootJson,
            rootWorkspaceContext,
            MONOREPO_SOURCE,
        );
    });

    it("skips workspace lookup for GitLab repo", async () => {
        const fetchMock = stubMonorepo();
        const { urlInput, loadFromUrlInput, loadPackageJsonText } = setup();
        urlInput.value = "https://gitlab.com/o/r";

        await loadFromUrlInput();

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(loadPackageJsonText).toHaveBeenCalledWith(monorepoRootJson, null, {
            kind: "url",
            url: "https://gitlab.com/o/r",
        });
    });

    it("loadWorkspace loads workspace package.json, keeps list, marks current", async () => {
        const fetchMock = stubMonorepo();
        const { loadWorkspace, loadPackageJsonText } = setup();

        await loadWorkspace(rootWorkspaceContext, "packages/a");

        expect(fetchMock.mock.calls[0][0]).toBe(
            "https://raw.githubusercontent.com/o/r/main/packages/a/package.json",
        );
        expect(loadPackageJsonText).toHaveBeenCalledWith(
            PACKAGE_JSON,
            { ...rootWorkspaceContext, current: "packages/a" },
            { kind: "workspace", path: "packages/a" },
        );
    });

    it("lists workspaces on branch holding package.json", async () => {
        const fetchMock = vi.fn(async (url: string) => {
            if (url.includes("/main/")) {
                return statusResponse(HTTP_STATUS.notFound);
            }
            if (url.includes("/git/trees/")) {
                return jsonResponse(githubTreeBody(["packages/a"]));
            }
            return textResponse(monorepoRootJson);
        });
        vi.stubGlobal("fetch", fetchMock);
        const { urlInput, loadFromUrlInput, loadPackageJsonText } = setup();
        urlInput.value = "https://github.com/o/r";

        await loadFromUrlInput();

        expect(fetchMock.mock.calls.map(([url]) => url)).toContain(
            "https://api.github.com/repos/o/r/git/trees/master?recursive=1",
        );
        expect(loadPackageJsonText).toHaveBeenCalledWith(
            monorepoRootJson,
            {
                ...rootWorkspaceContext,
                repo: { ...monorepoRef, branch: "master" },
                paths: ["packages/a"],
            },
            MONOREPO_SOURCE,
        );
    });

    it("loads root with failed context for failed workspace listing", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async (url: string) =>
                url.includes("/git/trees/")
                    ? statusResponse(HTTP_STATUS.forbidden)
                    : textResponse(monorepoRootJson),
            ),
        );
        const { urlInput, loadFromUrlInput, loadPackageJsonText, loadError } = setup();
        urlInput.value = "https://github.com/o/r";

        await loadFromUrlInput();

        expect(loadPackageJsonText).toHaveBeenCalledWith(
            monorepoRootJson,
            { ...rootWorkspaceContext, paths: [], failed: true },
            MONOREPO_SOURCE,
        );
        expect(loadError.value).toBeNull();
    });

    it("drops slow workspace load once newer file load finished", async () => {
        let resolveSlow: (response: unknown) => void;
        vi.stubGlobal(
            "fetch",
            vi.fn(
                () =>
                    new Promise((resolve) => {
                        resolveSlow = resolve;
                    }),
            ),
        );
        const { loadWorkspace, loadFromFile, loadPackageJsonText, loadError, isLoadingInput } =
            setup();

        const slowLoad = loadWorkspace(rootWorkspaceContext, "packages/a");
        await loadFromFile(
            changeEvent({ files: [new File(['{"name":"file"}'], "package.json")], value: "" }),
        );
        resolveSlow!(statusResponse(HTTP_STATUS.notFound));
        await slowLoad;

        expect(loadPackageJsonText).toHaveBeenCalledTimes(1);
        expect(loadPackageJsonText).toHaveBeenCalledWith('{"name":"file"}', null, null);
        expect(loadError.value).toBeNull();
        expect(isLoadingInput.value).toBe(false);
    });

    it("loadWorkspace shows error naming missing workspace", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => statusResponse(HTTP_STATUS.notFound)),
        );
        const { loadWorkspace, loadPackageJsonText, loadError } = setup();

        await loadWorkspace(rootWorkspaceContext, "packages/gone");

        expect(loadError.value).toBe(
            'Could not load the package.json of workspace "packages/gone".',
        );
        expect(loadPackageJsonText).not.toHaveBeenCalled();
    });
});

describe("load result", () => {
    it("loadUrl loads given URL, leaves URL input alone, resolves true", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => textResponse(PACKAGE_JSON)),
        );
        const { loadUrl, urlInput, loadPackageJsonText } = setup();

        const loaded = await loadUrl("https://example.com/package.json");

        expect(loaded).toBe(true);
        expect(urlInput.value).toBe("");
        expect(loadPackageJsonText).toHaveBeenCalledWith(PACKAGE_JSON, null, {
            kind: "url",
            url: "https://example.com/package.json",
        });
    });

    it("resolves false for text rejected by loadPackageJsonText", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => textResponse("{bad")),
        );
        const { loadUrl, loadPackageJsonText } = setup();
        loadPackageJsonText.mockReturnValue(false);

        expect(await loadUrl("https://example.com/package.json")).toBe(false);
    });

    it("resolves false for invalid URL, failed fetch, missing file", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => statusResponse(HTTP_STATUS.notFound)),
        );
        const { loadUrl, loadDependency, loadWorkspace, loadFromFile } = setup();

        expect(await loadUrl("example.com/package.json")).toBe(false);
        expect(await loadUrl("https://example.com/package.json")).toBe(false);
        expect(await loadDependency({ name: "ghost-pkg", version: "1.0.0" })).toBe(false);
        expect(await loadWorkspace(rootWorkspaceContext, "packages/gone")).toBe(false);
        expect(await loadFromFile(changeEvent({ files: [], value: "" }))).toBe(false);
    });

    it("resolves false for load dropped by newer load", async () => {
        let resolveSlow: (response: unknown) => void;
        vi.stubGlobal(
            "fetch",
            vi.fn(
                () =>
                    new Promise((resolve) => {
                        resolveSlow = resolve;
                    }),
            ),
        );
        const { loadUrl, loadFromFile } = setup();

        const slowLoad = loadUrl("https://slow.example/package.json");
        const fileLoad = loadFromFile(
            changeEvent({ files: [new File([PACKAGE_JSON], "package.json")], value: "" }),
        );
        resolveSlow!(textResponse(PACKAGE_JSON));

        expect(await slowLoad).toBe(false);
        expect(await fileLoad).toBe(true);
    });
});

describe("loadDependency", () => {
    it("tags loaded text with dependency name and range", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () =>
                jsonResponse({
                    "dist-tags": { latest: "1.2.0" },
                    versions: { "1.2.0": { name: "@scope/dep" } },
                }),
            ),
        );
        const { loadDependency, loadPackageJsonText } = setup();

        const loaded = await loadDependency({ name: "@scope/dep", version: "^1.0.0" });

        expect(loaded).toBe(true);
        expect(loadPackageJsonText).toHaveBeenCalledWith(
            expect.stringContaining('"name": "@scope/dep"'),
            null,
            { kind: "dependency", name: "@scope/dep", version: "^1.0.0" },
        );
    });

    it("shows not-found error naming unknown package", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => statusResponse(HTTP_STATUS.notFound)),
        );
        const { loadDependency, loadError, loadPackageJsonText } = setup();

        await loadDependency({ name: "ghost-pkg", version: "1.0.0" });

        expect(loadError.value).toBe('Could not find package.json data for "ghost-pkg".');
        expect(loadPackageJsonText).not.toHaveBeenCalled();
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

describe("loadFromFile", () => {
    it("loads file text, resets input for same-file reselect", async () => {
        const { loadFromFile, loadPackageJsonText } = setup();
        const input = {
            files: [new File([PACKAGE_JSON], "package.json")],
            value: "C:\\package.json",
        };

        await loadFromFile(changeEvent(input));

        expect(loadPackageJsonText).toHaveBeenCalledWith(PACKAGE_JSON, null, null);
        expect(input.value).toBe("");
    });
});

describe("loadFromFile failures", () => {
    it("does nothing without chosen file", async () => {
        const { loadFromFile, loadPackageJsonText, loadError, isLoadingInput } = setup();
        loadError.value = "old error";

        await loadFromFile(changeEvent({ files: [], value: "" }));

        expect(loadPackageJsonText).not.toHaveBeenCalled();
        expect(loadError.value).toBe("old error");
        expect(isLoadingInput.value).toBe(false);
    });

    it("shows empty-file error for empty file", async () => {
        const { loadFromFile, loadPackageJsonText, loadError } = setup();

        await loadFromFile(changeEvent({ files: [new File([], "package.json")], value: "" }));

        expect(loadError.value).toBe("The selected file is empty.");
        expect(loadPackageJsonText).not.toHaveBeenCalled();
    });

    it("shows read error for unreadable file", async () => {
        const { loadFromFile, loadError } = setup();
        const file = { text: () => Promise.reject(new Error("NotReadableError")) };

        await loadFromFile(changeEvent({ files: [file], value: "" }));

        expect(loadError.value).toBe("Failed to read the selected file.");
    });
});

describe("URL query sync", () => {
    it("starts with ?inputUrl= value", () => {
        window.history.replaceState(null, "", "/?inputUrl=https%3A%2F%2Fa.example%2Fp.json");

        expect(setup().urlInput.value).toBe("https://a.example/p.json");
    });

    it("syncs under path starting with //, keeps origin and path", async () => {
        vi.useFakeTimers();
        const { origin } = window.location;
        window.history.replaceState(null, "", `${origin}//deep/path?keep=1`);
        const { urlInput } = setup();

        urlInput.value = "https://a.example";
        await nextTick();
        vi.advanceTimersByTime(URL_SYNC_DEBOUNCE_MS);

        expect(window.location.href).toBe(
            `${origin}//deep/path?keep=1&inputUrl=https%3A%2F%2Fa.example`,
        );
    });

    it("drops inputUrl param once input is cleared", async () => {
        vi.useFakeTimers();
        window.history.replaceState(null, "", "/?inputUrl=https%3A%2F%2Fa.example&keep=1");
        const { urlInput } = setup();

        urlInput.value = "";
        await nextTick();
        vi.advanceTimersByTime(URL_SYNC_DEBOUNCE_MS);

        expect(window.location.search).toBe("?keep=1");
    });

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
