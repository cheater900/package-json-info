import { describe, expect, it, vi } from "vitest";
import {
    fetchDependencySource,
    fetchUrlSource,
    fetchWorkspaceSource,
} from "../../../../src/core/api/packageJsonSource";
import { HttpError } from "../../../../src/core/api/http";
import {
    jsonResponse,
    stubFetchByUrl,
    stubFetchWith,
    textResponse,
} from "../../../helpers/fetchMock";

const WORKSPACE_CONTEXT = {
    repo: { owner: "o", repo: "r", branch: "main" },
    paths: ["", "packages/a"],
    current: "",
    truncated: false,
    failed: false,
};

describe("fetchUrlSource", () => {
    it("fetches non-repo URL as-is", async () => {
        const fetchMock = vi.fn(async () => textResponse('{"name":"x"}'));
        vi.stubGlobal("fetch", fetchMock);

        const source = await fetchUrlSource("https://example.com/package.json");

        expect(source).toEqual({ text: '{"name":"x"}' });
        expect(fetchMock).toHaveBeenCalledWith(
            "https://example.com/package.json",
            expect.anything(),
        );
    });

    it("throws HttpError for 404 of raw URL", async () => {
        stubFetchWith(() => jsonResponse(null, false));

        await expect(fetchUrlSource("https://example.com/package.json")).rejects.toThrow(HttpError);
    });

    it("resolves non-GitHub repo URL without workspace lookup", async () => {
        const fetchMock = vi.fn(async () => textResponse('{"name":"x"}'));
        vi.stubGlobal("fetch", fetchMock);

        const source = await fetchUrlSource("https://gitlab.com/o/r");

        expect(source).toEqual({ text: '{"name":"x"}' });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("lists workspaces for GitHub repo root package.json", async () => {
        stubFetchByUrl({
            "raw.githubusercontent.com/o/r/main/package.json": {
                name: "root",
                workspaces: ["packages/*"],
            },
            "api.github.com/repos/o/r/git/trees/main": {
                tree: [{ path: "packages/a/package.json", type: "blob" }],
            },
        });

        const source = await fetchUrlSource("https://github.com/o/r");

        expect(source?.workspace).toMatchObject({
            repo: { owner: "o", repo: "r", branch: "main" },
            paths: ["packages/a"],
            current: "",
            failed: false,
        });
    });

    it("returns null for repo URL without package.json", async () => {
        stubFetchByUrl({});

        expect(await fetchUrlSource("https://github.com/o/r")).toBeNull();
    });

    it.each(["javascript:alert(1)", "file:///etc/passwd", "example.com/package.json"])(
        "rejects non-http URL %s without fetch",
        async (url) => {
            const fetchMock = vi.fn();
            vi.stubGlobal("fetch", fetchMock);

            await expect(fetchUrlSource(url)).rejects.toThrow("http:// or https://");
            expect(fetchMock).not.toHaveBeenCalled();
        },
    );
});

describe("fetchDependencySource", () => {
    it("returns published package.json text of resolved version", async () => {
        stubFetchByUrl({
            "registry.npmjs.org/found-pkg": {
                "dist-tags": { latest: "1.0.0" },
                time: {},
                versions: { "1.0.0": { name: "found-pkg", version: "1.0.0" } },
            },
        });

        const source = await fetchDependencySource({ name: "found-pkg", version: "1.0.0" });

        expect(JSON.parse(source!.text)).toMatchObject({ name: "found-pkg", version: "1.0.0" });
        expect(source).not.toHaveProperty("workspace");
    });

    it("returns null for unknown package", async () => {
        stubFetchWith(() => jsonResponse(null, false));

        expect(await fetchDependencySource({ name: "missing-pkg", version: "^1.0.0" })).toBeNull();
    });
});

describe("fetchWorkspaceSource", () => {
    it("carries workspace list over with new current path", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => textResponse('{"name":"a"}')),
        );

        const source = await fetchWorkspaceSource(WORKSPACE_CONTEXT, "packages/a");

        expect(source).toEqual({
            text: '{"name":"a"}',
            workspace: { ...WORKSPACE_CONTEXT, current: "packages/a" },
        });
    });
});
