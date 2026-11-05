import { describe, expect, it, vi } from "vitest";
import {
    fetchDependencySource,
    fetchUrlSource,
    fetchWorkspaceSource,
} from "../../../../src/core/api/packageJsonSource";
import { HttpError } from "../../../../src/core/api/http";
import { jsonResponse, textResponse } from "../../../helpers/fetchMock";

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
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => jsonResponse(null, false)),
        );

        await expect(fetchUrlSource("https://example.com/package.json")).rejects.toThrow(HttpError);
    });

    it("resolves non-GitHub repo URL without workspace lookup", async () => {
        const fetchMock = vi.fn(async () => textResponse('{"name":"x"}'));
        vi.stubGlobal("fetch", fetchMock);

        const source = await fetchUrlSource("https://gitlab.com/o/r");

        expect(source).toEqual({ text: '{"name":"x"}' });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});

describe("fetchDependencySource", () => {
    it("returns null for unknown package", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => jsonResponse(null, false)),
        );

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
