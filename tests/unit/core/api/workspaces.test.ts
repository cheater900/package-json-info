import { describe, it, expect, vi } from "vitest";
import {
    fetchWorkspaceContext,
    fetchWorkspacePackageJson,
} from "../../../../src/core/api/workspaces";
import { MAX_WORKSPACE_DIRS } from "../../../../src/core/constants";
import {
    HTTP_STATUS,
    countFetchCalls,
    jsonResponse,
    statusResponse,
    stubFetchSized,
    stubFetchWith,
    textResponse,
} from "../../../helpers/fetchMock";
import {
    githubTreeBody,
    monorepoRef,
    monorepoRootJson,
    rootWorkspaceContext,
} from "../../../fixtures/workspaces";

const TREE_URL = "https://api.github.com/repos/o/r/git/trees/main?recursive=1";
const PNPM_URL = "https://raw.githubusercontent.com/o/r/main/pnpm-workspace.yaml";
const TREE = {
    tree: [
        { path: "packages", type: "tree" },
        { path: "packages/a", type: "tree" },
        { path: "packages/a/package.json", type: "blob" },
        { path: "packages/b/package.json", type: "blob" },
        { path: "packages/sub/package.json", type: "commit" },
    ],
};

/** Answers the tree URL with `tree`, the pnpm file URL with `pnpm`; 404 otherwise. */
function stubRepo(responses: { tree?: unknown; pnpm?: unknown }) {
    const fetchMock = vi.fn(async (url: string) => {
        if (url === TREE_URL && responses.tree) {
            return responses.tree;
        }
        if (url === PNPM_URL && responses.pnpm) {
            return responses.pnpm;
        }
        return statusResponse(HTTP_STATUS.notFound);
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
}

describe("fetchWorkspaceContext", () => {
    it("lists workspace folders from package.json patterns, skips pnpm file", async () => {
        const fetchMock = stubRepo({ tree: jsonResponse(TREE) });

        const context = await fetchWorkspaceContext(monorepoRef, monorepoRootJson);

        expect(context).toEqual(rootWorkspaceContext);
        expect(countFetchCalls(fetchMock, "pnpm-workspace.yaml")).toBe(0);
    });

    it("reads patterns from pnpm-workspace.yaml without workspaces field", async () => {
        stubRepo({
            tree: jsonResponse(TREE),
            pnpm: textResponse("packages:\n  - packages/a\n"),
        });

        const context = await fetchWorkspaceContext(monorepoRef, '{"name":"root"}');

        expect(context?.paths).toEqual(["packages/a"]);
    });

    it.each([
        ["no workspaces anywhere", '{"name":"x"}'],
        ["invalid JSON", "{not json"],
    ])("returns null without tree request for %s", async (_case, text) => {
        const fetchMock = stubRepo({ tree: jsonResponse(TREE) });

        expect(await fetchWorkspaceContext(monorepoRef, text)).toBeNull();
        expect(countFetchCalls(fetchMock, "/git/trees/")).toBe(0);
    });

    it("encodes branch in pnpm-workspace.yaml URL", async () => {
        const fetchMock = stubRepo({});

        await fetchWorkspaceContext({ ...monorepoRef, branch: "fix#1" }, "{}");

        expect(fetchMock.mock.calls[0][0]).toBe(
            "https://raw.githubusercontent.com/o/r/fix%231/pnpm-workspace.yaml",
        );
    });

    it("returns null without tree request for empty pnpm packages list", async () => {
        const fetchMock = stubRepo({
            tree: jsonResponse(TREE),
            pnpm: textResponse("packages: []\n"),
        });

        expect(await fetchWorkspaceContext(monorepoRef, "{}")).toBeNull();
        expect(countFetchCalls(fetchMock, "/git/trees/")).toBe(0);
    });

    it("lists no workspace for tree answer without tree, unflagged", async () => {
        stubRepo({ tree: jsonResponse({ message: "empty" }) });

        const context = await fetchWorkspaceContext(monorepoRef, monorepoRootJson);

        expect(context).toMatchObject({ paths: [], truncated: false, failed: false });
    });

    it("flags failed for malformed tree JSON", async () => {
        stubRepo({
            tree: {
                ok: true,
                status: HTTP_STATUS.ok,
                json: async () => JSON.parse("<html>"),
            },
        });

        const context = await fetchWorkspaceContext(monorepoRef, monorepoRootJson);

        expect(context).toEqual({ ...rootWorkspaceContext, paths: [], failed: true });
    });

    it("flags failed for network error", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => {
                throw new TypeError("Failed to fetch");
            }),
        );

        const context = await fetchWorkspaceContext(monorepoRef, monorepoRootJson);

        expect(context).toMatchObject({ paths: [], failed: true });
    });

    it("flags truncated for more matches than MAX_WORKSPACE_DIRS", async () => {
        const dirs = Array.from(
            { length: MAX_WORKSPACE_DIRS + 1 },
            (_, index) => `packages/${index}`,
        );
        stubRepo({ tree: jsonResponse(githubTreeBody(dirs)) });

        const context = await fetchWorkspaceContext(monorepoRef, monorepoRootJson);

        expect(context?.paths).toHaveLength(MAX_WORKSPACE_DIRS);
        expect(context).toMatchObject({ truncated: true, failed: false });
    });

    it("flags failed for rate-limited tree request, never throws", async () => {
        stubRepo({ tree: statusResponse(HTTP_STATUS.forbidden) });

        const context = await fetchWorkspaceContext(monorepoRef, monorepoRootJson);

        expect(context).toMatchObject({ paths: [], failed: true });
    });

    it("flags failed for pnpm file server error", async () => {
        stubRepo({ pnpm: statusResponse(HTTP_STATUS.serverError) });

        const context = await fetchWorkspaceContext(monorepoRef, "{}");

        expect(context).toMatchObject({ paths: [], failed: true });
    });

    it("flags failed for endless pnpm file", async () => {
        stubFetchSized(Infinity);

        const context = await fetchWorkspaceContext(monorepoRef, "{}");

        expect(context).toMatchObject({ paths: [], failed: true });
    });

    it("passes truncated flag from GitHub", async () => {
        stubRepo({ tree: jsonResponse({ ...TREE, truncated: true }) });

        const context = await fetchWorkspaceContext(monorepoRef, monorepoRootJson);

        expect(context?.truncated).toBe(true);
    });
});

describe("fetchWorkspacePackageJson", () => {
    it("fetches workspace package.json with encoded path segments", async () => {
        const fetchMock = vi.fn(async (_url: string) => textResponse('{"name":"a"}'));
        vi.stubGlobal("fetch", fetchMock);

        const text = await fetchWorkspacePackageJson(monorepoRef, "packages/a b#c");

        expect(text).toBe('{"name":"a"}');
        expect(fetchMock.mock.calls[0][0]).toBe(
            "https://raw.githubusercontent.com/o/r/main/packages/a%20b%23c/package.json",
        );
    });

    it("fetches root package.json for root path", async () => {
        const fetchMock = vi.fn(async (_url: string) => textResponse("{}"));
        vi.stubGlobal("fetch", fetchMock);

        await fetchWorkspacePackageJson(monorepoRef, "");

        expect(fetchMock.mock.calls[0][0]).toBe(
            "https://raw.githubusercontent.com/o/r/main/package.json",
        );
    });

    it("encodes branch holding # or %", async () => {
        const fetchMock = vi.fn(async (_url: string) => textResponse("{}"));
        vi.stubGlobal("fetch", fetchMock);

        await fetchWorkspacePackageJson({ ...monorepoRef, branch: "fix#1%" }, "packages/a");

        expect(fetchMock.mock.calls[0][0]).toBe(
            "https://raw.githubusercontent.com/o/r/fix%231%25/packages/a/package.json",
        );
    });

    it("throws for missing workspace package.json", async () => {
        stubFetchWith(() => statusResponse(HTTP_STATUS.notFound));

        await expect(fetchWorkspacePackageJson(monorepoRef, "packages/gone")).rejects.toThrow();
    });

    it("throws for endless workspace package.json", async () => {
        stubFetchSized(Infinity);

        await expect(fetchWorkspacePackageJson(monorepoRef, "packages/a")).rejects.toThrow(
            "larger than 10 MB",
        );
    });
});
