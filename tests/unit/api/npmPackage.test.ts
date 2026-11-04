import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
    fetchPackageInfo,
    fetchPackagesInfo,
    fetchPackageJsonForVersion,
    clearPackageInfoCache,
} from "../../../src/api/npmPackage";
import { OSV_MAX_PAGES } from "../../../src/constants";
import { clearLookups, loadLookup, saveLookup } from "../../../src/utils/lookupStore";
import type { LookupKind } from "../../../src/utils/lookupStore";
import { columnKeysExcept } from "../../helpers/columns";
import {
    countFetchCalls,
    jsonResponse,
    HTTP_STATUS,
    statusResponse,
    stubFetchByUrl,
} from "../../helpers/fetchMock";
import { IDBObjectStore } from "fake-indexeddb";
import { githubToken } from "../../../src/settings";
import { resetSettings, stubIndexedDb } from "../../helpers/settings";
import { minimalRegistryDoc } from "../../fixtures/dependencies";
import { recordRequests, subjectOf, subjectsOf } from "../../helpers/requests";
import { githubTokenFixture as TOKEN } from "../../fixtures/github";

function visibleColumnsExcept(...excluded: string[]): Set<string> {
    return new Set(columnKeysExcept(...excluded));
}

beforeEach(() => {
    clearPackageInfoCache();
});

describe("fetchPackageInfo", () => {
    it("resolves npm registry, downloads, GitHub data for GitHub repository", async () => {
        stubFetchByUrl({
            "registry.npmjs.org/left-pad": {
                "dist-tags": { latest: "1.3.0" },
                time: {
                    "1.2.0": "2020-01-01T00:00:00.000Z",
                    "1.3.0": "2021-01-01T00:00:00.000Z",
                    modified: "2021-06-01T00:00:00.000Z",
                },
                repository: {
                    type: "git",
                    url: "git+https://github.com/left-pad/left-pad.git",
                },
                versions: {
                    "1.2.0": {
                        dependencies: { "tiny-dep": "^1.0.0" },
                        dist: {
                            tarball: "https://registry.npmjs.org/left-pad/-/left-pad-1.2.0.tgz",
                        },
                    },
                },
            },
            "api.npmjs.org/downloads": { downloads: 4242 },
            "/commits": [
                { commit: { committer: { date: "2021-05-01T00:00:00Z" } } },
                { commit: { committer: { date: "2021-04-01T00:00:00Z" } } },
            ],
            "api.github.com/repos/left-pad/left-pad": { stargazers_count: 99 },
            "is:pr+is:open": { total_count: 2 },
            "is:pr+is:closed": { total_count: 10 },
            "is:issue+is:open": { total_count: 3 },
            "is:issue+is:closed": { total_count: 20 },
        });

        const info = await fetchPackageInfo("left-pad", "1.2.0");

        expect(info).toEqual({
            name: "left-pad",
            version: "1.2.0",
            versionDate: "2020-01-01T00:00:00.000Z",
            latestVersion: "1.3.0",
            latestReleaseDate: "2021-01-01T00:00:00.000Z",
            latestUpdateDate: "2021-06-01T00:00:00.000Z",
            weeklyDownloads: 4242,
            sourceCode: "https://github.com/left-pad/left-pad",
            gitStars: 99,
            lastCommitDate: "2021-05-01T00:00:00Z",
            commitsLastYear: 2,
            openPRs: 2,
            closedPRs: 10,
            openIssues: 3,
            closedIssues: 20,
            dependencies: ["tiny-dep"],
            license: null,
            isOutdated: true,
            // Stale release and outdated version, against no deprecation and 3 of 23 issues open.
            healthScore: 56,
            healthSignals: ["releaseAge", "deprecated", "outdated", "issues"],
            deprecated: null,
            vulnerabilityCount: null,
            bundleSizeGzip: null,
            maintainers: null,
            sourceTree: {
                provider: "npm",
                tarballUrl: "https://registry.npmjs.org/left-pad/-/left-pad-1.2.0.tgz",
            },
            staleSince: null,
            failedLookups: null,
        });
    });

    it("falls back to latest version dependencies for unknown installed version", async () => {
        stubFetchByUrl({
            "registry.npmjs.org/foo": {
                "dist-tags": { latest: "2.0.0" },
                time: {},
                versions: {
                    "2.0.0": { dependencies: { bar: "^1.0.0" } },
                },
            },
            "api.npmjs.org/downloads": { downloads: 0 },
        });

        const info = await fetchPackageInfo("foo", "^1.0.0");

        expect(info.dependencies).toEqual(["bar"]);
    });

    it("leaves GitHub-derived fields null without repository", async () => {
        stubFetchByUrl({
            "registry.npmjs.org/no-repo": {
                "dist-tags": { latest: "1.0.0" },
                time: {},
            },
            "api.npmjs.org/downloads": { downloads: 5 },
        });

        const info = await fetchPackageInfo("no-repo", "1.0.0");

        expect(info.sourceCode).toBeNull();
        expect(info.gitStars).toBeNull();
        expect(info.openPRs).toBeNull();
        expect(info.closedPRs).toBeNull();
        expect(info.openIssues).toBeNull();
        expect(info.closedIssues).toBeNull();
        expect(info.dependencies).toBeNull();
        expect(info.license).toBeNull();
        expect(info.deprecated).toBeNull();
        expect(info.vulnerabilityCount).toBeNull();
        expect(info.bundleSizeGzip).toBeNull();
        expect(info.maintainers).toBeNull();
    });

    it("resolves stars from GitLab, leaves PR/issue counts null", async () => {
        stubFetchByUrl({
            "registry.npmjs.org/gl-pkg": {
                "dist-tags": { latest: "1.0.0" },
                time: {},
                repository: {
                    type: "git",
                    url: "git+https://gitlab.com/some-group/gl-pkg.git",
                },
            },
            "api.npmjs.org/downloads": { downloads: 7 },
            "gitlab.com/api/v4/projects/some-group%2Fgl-pkg": { star_count: 55 },
        });

        const info = await fetchPackageInfo("gl-pkg", "1.0.0");

        expect(info.sourceCode).toBe("https://gitlab.com/some-group/gl-pkg");
        expect(info.gitStars).toBe(55);
        expect(info.openPRs).toBeNull();
        expect(info.closedPRs).toBeNull();
        expect(info.openIssues).toBeNull();
        expect(info.closedIssues).toBeNull();
        expect(info.lastCommitDate).toBeNull();
        expect(info.commitsLastYear).toBeNull();
    });

    it("skips commit request for non-GitHub repository", async () => {
        const fetchMock = stubFetchByUrl({
            "registry.npmjs.org/gl-pkg": {
                "dist-tags": { latest: "1.0.0" },
                time: {},
                repository: "git+https://gitlab.com/some-group/gl-pkg.git",
            },
        });

        const info = await fetchPackageInfo("gl-pkg", "1.0.0", {
            visibleColumns: new Set(["lastCommitDate"]),
        });

        expect(info.lastCommitDate).toBeNull();
        expect(countFetchCalls(fetchMock, "gitlab.com")).toBe(0);
        expect(countFetchCalls(fetchMock, "api.github.com")).toBe(0);
    });

    it("skips commit request with lastCommitDate hidden", async () => {
        const fetchMock = stubFetchByUrl({
            "registry.npmjs.org/hidden-pkg": {
                "dist-tags": { latest: "1.0.0" },
                time: {},
                repository: "git+https://github.com/o/r.git",
            },
            "api.github.com/repos/o/r": { stargazers_count: 1 },
        });

        const info = await fetchPackageInfo("hidden-pkg", "1.0.0", {
            visibleColumns: new Set(["gitStars"]),
        });

        expect(info.gitStars).toBe(1);
        expect(info.commitsLastYear).toBeNull();
        expect(countFetchCalls(fetchMock, "/commits")).toBe(0);
    });

    it("returns 0 commits + null date for empty window", async () => {
        stubFetchByUrl({
            "registry.npmjs.org/quiet-pkg": {
                "dist-tags": { latest: "1.0.0" },
                time: {},
                repository: "git+https://github.com/o/r.git",
            },
            "/commits": [],
        });

        const info = await fetchPackageInfo("quiet-pkg", "1.0.0", {
            visibleColumns: new Set(["lastCommitDate"]),
        });

        expect(info.lastCommitDate).toBeNull();
        expect(info.commitsLastYear).toBe(0);
    });

    it("counts commits lacking committer, dates from first commit with one", async () => {
        stubFetchByUrl({
            "registry.npmjs.org/odd-pkg": {
                "dist-tags": { latest: "1.0.0" },
                time: {},
                repository: "git+https://github.com/o/r.git",
            },
            "/commits": [
                { commit: { committer: null } },
                { commit: { committer: { name: "x" } } },
                { commit: { committer: { date: "2024-03-01T00:00:00Z" } } },
            ],
        });

        const info = await fetchPackageInfo("odd-pkg", "1.0.0", {
            visibleColumns: new Set(["lastCommitDate"]),
        });

        expect(info.lastCommitDate).toBe("2024-03-01T00:00:00Z");
        expect(info.commitsLastYear).toBe(3);
    });

    it("resolves stars from Codeberg for Codeberg repository", async () => {
        stubFetchByUrl({
            "registry.npmjs.org/cb-pkg": {
                "dist-tags": { latest: "1.0.0" },
                time: {},
                repository: { type: "git", url: "https://codeberg.org/some-org/cb-pkg" },
            },
            "api.npmjs.org/downloads": { downloads: 3 },
            "codeberg.org/api/v1/repos/some-org/cb-pkg": { stars_count: 12 },
        });

        const info = await fetchPackageInfo("cb-pkg", "1.0.0");

        expect(info.sourceCode).toBe("https://codeberg.org/some-org/cb-pkg");
        expect(info.gitStars).toBe(12);
    });

    it("extracts license, deprecation notice, maintainers from registry response", async () => {
        stubFetchByUrl({
            "registry.npmjs.org/rich-meta": {
                "dist-tags": { latest: "1.0.0" },
                time: {},
                maintainers: [{ name: "alice" }, { name: "bob" }],
                versions: {
                    "1.0.0": { license: "MIT", deprecated: "use rich-meta-v2 instead" },
                },
            },
            "api.npmjs.org/downloads": { downloads: 0 },
        });

        const info = await fetchPackageInfo("rich-meta", "1.0.0");

        expect(info.license).toBe("MIT");
        expect(info.deprecated).toBe("use rich-meta-v2 instead");
        expect(info.maintainers).toEqual(["alice", "bob"]);
    });

    it("falls back to package-level license without version license", async () => {
        stubFetchByUrl({
            "registry.npmjs.org/pkg-level-license": {
                "dist-tags": { latest: "1.0.0" },
                time: {},
                license: "Apache-2.0",
                versions: { "1.0.0": {} },
            },
            "api.npmjs.org/downloads": { downloads: 0 },
        });

        const info = await fetchPackageInfo("pkg-level-license", "1.0.0");

        expect(info.license).toBe("Apache-2.0");
    });

    it("marks package up to date for latest declared version", async () => {
        stubFetchByUrl({
            "registry.npmjs.org/current-pkg": {
                "dist-tags": { latest: "2.0.0" },
                time: {},
            },
            "api.npmjs.org/downloads": { downloads: 0 },
        });

        const info = await fetchPackageInfo("current-pkg", "^2.0.0");

        expect(info.isOutdated).toBe(false);
    });

    it("reports vulnerability count from OSV", async () => {
        stubFetchByUrl({
            "registry.npmjs.org/vulnerable-pkg": minimalRegistryDoc,
            "api.npmjs.org/downloads": { downloads: 0 },
            "api.osv.dev/v1/query": {
                vulns: [{ id: "GHSA-aaaa-bbbb-cccc" }, { id: "GHSA-dddd-eeee-ffff" }],
            },
        });

        const info = await fetchPackageInfo("vulnerable-pkg", "1.0.0");

        expect(info.vulnerabilityCount).toBe(2);
    });

    it("sums vulnerabilities across OSV pages", async () => {
        const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
            if (!url.includes("api.osv.dev")) {
                return jsonResponse(minimalRegistryDoc);
            }
            const { page_token } = JSON.parse(String(init?.body));
            return page_token === "p2"
                ? jsonResponse({ vulns: [{ id: "B" }] })
                : jsonResponse({ vulns: [{ id: "A" }], next_page_token: "p2" });
        });
        vi.stubGlobal("fetch", fetchMock);

        const info = await fetchPackageInfo("paged-pkg", "1.0.0");

        expect(info.vulnerabilityCount).toBe(2);
        expect(countFetchCalls(fetchMock, "api.osv.dev")).toBe(2);
    });

    it("stops OSV paging on repeated token", async () => {
        const fetchMock = stubFetchByUrl({
            "registry.npmjs.org/loop-pkg": minimalRegistryDoc,
            "api.osv.dev/v1/query": { vulns: [{ id: "A" }], next_page_token: "same" },
        });

        const info = await fetchPackageInfo("loop-pkg", "1.0.0");

        expect(info.vulnerabilityCount).toBe(2);
        expect(countFetchCalls(fetchMock, "api.osv.dev")).toBe(2);
    });

    it("stops OSV paging on token cycle", async () => {
        const nextToken: Record<string, string> = { start: "A", A: "B", B: "A" };
        const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
            if (!url.includes("api.osv.dev")) {
                return jsonResponse(minimalRegistryDoc);
            }
            const { page_token = "start" } = JSON.parse(String(init?.body));
            return jsonResponse({ vulns: [{ id: "X" }], next_page_token: nextToken[page_token] });
        });
        vi.stubGlobal("fetch", fetchMock);

        const info = await fetchPackageInfo("cycle-pkg", "1.0.0");

        expect(info.vulnerabilityCount).toBe(3);
        expect(countFetchCalls(fetchMock, "api.osv.dev")).toBe(3);
    });

    it("gives up with null count on endless OSV tokens", async () => {
        let page = 0;
        const fetchMock = vi.fn(async (url: string) => {
            if (!url.includes("api.osv.dev")) {
                return jsonResponse(minimalRegistryDoc);
            }
            page++;
            return jsonResponse({ vulns: [{ id: "X" }], next_page_token: `p${page}` });
        });
        vi.stubGlobal("fetch", fetchMock);

        const info = await fetchPackageInfo("endless-pkg", "1.0.0");

        expect(info.vulnerabilityCount).toBeNull();
        expect(countFetchCalls(fetchMock, "api.osv.dev")).toBe(OSV_MAX_PAGES);
    });

    it("reports 0 vulnerabilities, not null, for empty OSV response", async () => {
        stubFetchByUrl({
            "registry.npmjs.org/clean-pkg": minimalRegistryDoc,
            "api.npmjs.org/downloads": { downloads: 0 },
            "api.osv.dev/v1/query": { vulns: [] },
        });

        const info = await fetchPackageInfo("clean-pkg", "1.0.0");

        expect(info.vulnerabilityCount).toBe(0);
    });

    it("reports gzip bundle size from Bundlephobia", async () => {
        stubFetchByUrl({
            "registry.npmjs.org/sized-pkg": minimalRegistryDoc,
            "api.npmjs.org/downloads": { downloads: 0 },
            "bundlephobia.com/api/size": { gzip: 2048 },
        });

        const info = await fetchPackageInfo("sized-pkg", "1.0.0");

        expect(info.bundleSizeGzip).toBe(2048);
    });

    it("resolves vulnerabilityCount and bundleSizeGzip null on API errors, lookup survives", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async (url: string) => {
                if (url.includes("registry.npmjs.org/flaky-pkg")) {
                    return jsonResponse(minimalRegistryDoc);
                }
                if (url.includes("api.npmjs.org/downloads")) {
                    return jsonResponse({ downloads: 0 });
                }
                if (url.includes("api.osv.dev") || url.includes("bundlephobia.com")) {
                    throw new Error("network error");
                }
                return jsonResponse(null, false);
            }),
        );

        const info = await fetchPackageInfo("flaky-pkg", "1.0.0");

        expect(info.vulnerabilityCount).toBeNull();
        expect(info.bundleSizeGzip).toBeNull();
        expect(info.name).toBe("flaky-pkg");
    });

    it("falls back to npm homepage without GitHub repository", async () => {
        stubFetchByUrl({
            "registry.npmjs.org/homepage-only": {
                "dist-tags": { latest: "1.0.0" },
                time: {},
                homepage: "https://example.com/homepage-only",
            },
            "api.npmjs.org/downloads": { downloads: 0 },
        });

        const info = await fetchPackageInfo("homepage-only", "1.0.0");

        expect(info.sourceCode).toBe("https://example.com/homepage-only");
    });
});

describe("fetchPackageInfo sourceTree", () => {
    it("prefers npm tarball over known GitHub repository", async () => {
        stubFetchByUrl({
            "registry.npmjs.org/has-tarball": {
                "dist-tags": { latest: "1.0.0" },
                time: {},
                repository: {
                    type: "git",
                    url: "git+https://github.com/some-org/some-repo.git",
                },
                versions: {
                    "1.0.0": {
                        dist: {
                            tarball:
                                "https://registry.npmjs.org/has-tarball/-/has-tarball-1.0.0.tgz",
                        },
                    },
                },
            },
            "api.npmjs.org/downloads": { downloads: 0 },
        });

        const info = await fetchPackageInfo("has-tarball", "1.0.0");

        expect(info.sourceTree).toEqual({
            provider: "npm",
            tarballUrl: "https://registry.npmjs.org/has-tarball/-/has-tarball-1.0.0.tgz",
        });
    });

    it("ignores non-http tarball URL", async () => {
        stubFetchByUrl({
            "registry.npmjs.org/data-tarball": {
                "dist-tags": { latest: "1.0.0" },
                versions: {
                    "1.0.0": { dist: { tarball: "data:application/gzip;base64,AA==" } },
                },
            },
        });

        const info = await fetchPackageInfo("data-tarball", "1.0.0");

        expect(info.sourceTree).toBeNull();
    });

    it("falls back to matching GitHub release tag without npm tarball", async () => {
        const fetchMock = vi.fn(async (url: string) => {
            if (url.includes("registry.npmjs.org/no-tarball")) {
                return jsonResponse({
                    "dist-tags": { latest: "1.0.0" },
                    time: {},
                    repository: {
                        type: "git",
                        url: "git+https://github.com/some-org/some-repo.git",
                    },
                    versions: { "1.0.0": {} },
                });
            }
            if (url.includes("api.npmjs.org/downloads")) {
                return jsonResponse({ downloads: 0 });
            }
            if (url.includes("git/ref/tags/v1.0.0")) {
                return jsonResponse({ ref: "refs/tags/v1.0.0" });
            }
            return jsonResponse(null, false);
        });
        vi.stubGlobal("fetch", fetchMock);

        const info = await fetchPackageInfo("no-tarball", "1.0.0");

        expect(info.sourceTree).toEqual({
            provider: "github",
            owner: "some-org",
            repo: "some-repo",
            tag: "v1.0.0",
        });
    });

    it("tries bare version tag without v-prefixed tag", async () => {
        const fetchMock = vi.fn(async (url: string) => {
            if (url.includes("registry.npmjs.org/bare-tag")) {
                return jsonResponse({
                    "dist-tags": { latest: "2.0.0" },
                    time: {},
                    repository: {
                        type: "git",
                        url: "git+https://github.com/some-org/some-repo.git",
                    },
                    versions: { "2.0.0": {} },
                });
            }
            if (url.includes("api.npmjs.org/downloads")) {
                return jsonResponse({ downloads: 0 });
            }
            if (url.includes("git/ref/tags/2.0.0")) {
                return jsonResponse({ ref: "refs/tags/2.0.0" });
            }
            return jsonResponse(null, false);
        });
        vi.stubGlobal("fetch", fetchMock);

        const info = await fetchPackageInfo("bare-tag", "2.0.0");

        expect(info.sourceTree?.provider).toBe("github");
        expect((info.sourceTree as { tag: string }).tag).toBe("2.0.0");
    });

    it("resolves null without npm tarball or matching GitHub tag", async () => {
        stubFetchByUrl({
            "registry.npmjs.org/no-source": {
                "dist-tags": { latest: "1.0.0" },
                time: {},
                repository: {
                    type: "git",
                    url: "git+https://github.com/some-org/some-repo.git",
                },
                versions: { "1.0.0": {} },
            },
            "api.npmjs.org/downloads": { downloads: 0 },
        });

        const info = await fetchPackageInfo("no-source", "1.0.0");

        expect(info.sourceTree).toBeNull();
    });

    it("resolves null without tarball or repository", async () => {
        stubFetchByUrl({
            "registry.npmjs.org/bare-pkg": minimalRegistryDoc,
            "api.npmjs.org/downloads": { downloads: 0 },
        });

        const info = await fetchPackageInfo("bare-pkg", "1.0.0");

        expect(info.sourceTree).toBeNull();
    });

    it("skips GitHub tag lookup with Source Code Tree column hidden", async () => {
        const fetchMock = stubFetchByUrl({
            "registry.npmjs.org/hidden-column": {
                "dist-tags": { latest: "1.0.0" },
                time: {},
                repository: { type: "git", url: "git+https://github.com/some-org/some-repo.git" },
                versions: { "1.0.0": {} },
            },
            "api.npmjs.org/downloads": { downloads: 0 },
        });

        const info = await fetchPackageInfo("hidden-column", "1.0.0", {
            visibleColumns: visibleColumnsExcept("sourceCodeTree"),
        });

        expect(info.sourceTree).toBeNull();
        expect(countFetchCalls(fetchMock, "git/ref/tags")).toBe(0);
    });

    it("caches GitHub tag lookup by repo slug and version across package names", async () => {
        const fetchMock = vi.fn(async (url: string) => {
            if (
                url.includes("registry.npmjs.org/shared-a") ||
                url.includes("registry.npmjs.org/shared-b")
            ) {
                return jsonResponse({
                    "dist-tags": { latest: "1.0.0" },
                    time: {},
                    repository: {
                        type: "git",
                        url: "git+https://github.com/shared-org/shared-repo.git",
                    },
                    versions: { "1.0.0": {} },
                });
            }
            if (url.includes("api.npmjs.org/downloads")) {
                return jsonResponse({ downloads: 0 });
            }
            if (url.includes("git/ref/tags/v1.0.0")) {
                return jsonResponse({ ref: "refs/tags/v1.0.0" });
            }
            return jsonResponse(null, false);
        });
        vi.stubGlobal("fetch", fetchMock);

        const a = await fetchPackageInfo("shared-a", "1.0.0");
        const b = await fetchPackageInfo("shared-b", "1.0.0");

        expect(a.sourceTree).toEqual({
            provider: "github",
            owner: "shared-org",
            repo: "shared-repo",
            tag: "v1.0.0",
        });
        expect(b.sourceTree).toEqual(a.sourceTree);
        expect(countFetchCalls(fetchMock, "git/ref/tags/v1.0.0")).toBe(1);
    });
});

describe("fetchPackageInfo caching", () => {
    it("reuses cached sub-fetches for repeated name+version", async () => {
        const fetchMock = stubFetchByUrl({
            "registry.npmjs.org/cached-pkg": minimalRegistryDoc,
            "api.npmjs.org/downloads": { downloads: 1 },
        });

        const first = await fetchPackageInfo("cached-pkg", "1.0.0");
        const second = await fetchPackageInfo("cached-pkg", "1.0.0");

        // Not the same object reference - each call composes its own result from
        // (cached) sub-fetches, since which fields get fetched can vary call to
        // call depending on visibleColumns - but no duplicate network request.
        expect(second).toEqual(first);
        expect(countFetchCalls(fetchMock, "registry.npmjs.org/cached-pkg")).toBe(1);
    });

    it("coalesces concurrent same name+version requests into one network round", async () => {
        const fetchMock = stubFetchByUrl({
            "registry.npmjs.org/concurrent-pkg": minimalRegistryDoc,
            "api.npmjs.org/downloads": { downloads: 1 },
        });

        const [first, second] = await Promise.all([
            fetchPackageInfo("concurrent-pkg", "1.0.0"),
            fetchPackageInfo("concurrent-pkg", "1.0.0"),
        ]);

        expect(second).toEqual(first);
        expect(countFetchCalls(fetchMock, "registry.npmjs.org/concurrent-pkg")).toBe(1);
    });

    it("shares name-scoped lookups across versions of same package", async () => {
        const fetchMock = stubFetchByUrl({
            "registry.npmjs.org/multi-version-pkg": {
                "dist-tags": { latest: "2.0.0" },
                time: {},
                versions: {
                    "1.0.0": { dependencies: { a: "^1.0.0" } },
                    "2.0.0": { dependencies: { b: "^1.0.0" } },
                },
            },
            "api.npmjs.org/downloads": { downloads: 1 },
            "api.osv.dev/v1/query": { vulns: [] },
            "bundlephobia.com/api/size": { gzip: 100 },
        });

        const v1 = await fetchPackageInfo("multi-version-pkg", "1.0.0");
        const v2 = await fetchPackageInfo("multi-version-pkg", "2.0.0");

        expect(v1.dependencies).toEqual(["a"]);
        expect(v2.dependencies).toEqual(["b"]);
        expect(countFetchCalls(fetchMock, "registry.npmjs.org/multi-version-pkg")).toBe(1);
        expect(countFetchCalls(fetchMock, "api.npmjs.org/downloads")).toBe(1);
        expect(countFetchCalls(fetchMock, "api.osv.dev")).toBe(1);
        // Bundle size is genuinely version-scoped, so it's fetched for each version.
        expect(countFetchCalls(fetchMock, "bundlephobia.com")).toBe(2);
    });

    it("shares repo metadata across package names with same repository", async () => {
        const sharedRepo = {
            repository: { type: "git", url: "git+https://github.com/shared-org/shared-repo.git" },
        };
        const fetchMock = vi.fn(async (url: string) => {
            if (url.includes("registry.npmjs.org/pkg-a")) {
                return jsonResponse({ ...minimalRegistryDoc, ...sharedRepo });
            }
            if (url.includes("registry.npmjs.org/pkg-b")) {
                return jsonResponse({ ...minimalRegistryDoc, ...sharedRepo });
            }
            if (url.includes("api.npmjs.org/downloads")) {
                return jsonResponse({ downloads: 1 });
            }
            if (url.includes("/commits")) {
                return jsonResponse([]);
            }
            if (url.includes("api.github.com/repos/shared-org/shared-repo")) {
                return jsonResponse({ stargazers_count: 777 });
            }
            if (url.includes("api.github.com/search/issues")) {
                return jsonResponse({ total_count: 0 });
            }
            return jsonResponse(null, false);
        });
        vi.stubGlobal("fetch", fetchMock);

        // sourceCodeTree isn't this test's concern, and (with no dist.tarball
        // in the mock) would otherwise also hit api.github.com/repos/... as a
        // tag-existence check, muddying the repo-metadata call count below.
        const options = { visibleColumns: visibleColumnsExcept("sourceCodeTree") };
        const a = await fetchPackageInfo("pkg-a", "1.0.0", options);
        const b = await fetchPackageInfo("pkg-b", "1.0.0", options);

        expect(a.gitStars).toBe(777);
        expect(b.gitStars).toBe(777);
        expect(countFetchCalls(fetchMock, "api.github.com/repos/shared-org/shared-repo")).toBe(2);
        expect(countFetchCalls(fetchMock, "/commits")).toBe(1);
    });

    it("skips caching failed lookup, next same-key call retries", async () => {
        let registryAttempts = 0;
        vi.stubGlobal(
            "fetch",
            vi.fn(async (url: string) => {
                if (url.includes("registry.npmjs.org/retry-pkg")) {
                    registryAttempts++;
                    if (registryAttempts === 1) {
                        throw new Error("network down");
                    }
                    return jsonResponse(minimalRegistryDoc);
                }
                if (url.includes("api.npmjs.org/downloads")) {
                    return jsonResponse({ downloads: 1 });
                }
                return jsonResponse(null, false);
            }),
        );

        await expect(fetchPackageInfo("retry-pkg", "1.0.0")).rejects.toThrow("network down");

        const info = await fetchPackageInfo("retry-pkg", "1.0.0");

        expect(info.name).toBe("retry-pkg");
        expect(registryAttempts).toBe(2);
    });
});

describe("fetchPackageInfo request subjects", () => {
    const SHARED_REPO_URL = "git+https://github.com/shared-org/shared-repo.git";
    let recorder = recordRequests();

    beforeEach(() => {
        recorder = recordRequests();
    });

    afterEach(() => {
        recorder.stop();
    });

    function registryDocWith(fields: Record<string, unknown>) {
        return { ...minimalRegistryDoc, ...fields };
    }

    it("tags registry request with row name and visible registry columns", async () => {
        stubFetchByUrl({ "registry.npmjs.org/real-pkg": minimalRegistryDoc });

        await fetchPackageInfo("alias-pkg", "npm:real-pkg@1.0.0", {
            visibleColumns: new Set(["license", "weeklyDownloads"]),
        });

        expect(subjectsOf(recorder.requests, "registry.npmjs.org")).toEqual([
            subjectOf(["alias-pkg"], ["license"]),
        ]);
    });

    it.each([
        ["weeklyDownloads", "api.npmjs.org/downloads"],
        ["vulnerabilityCount", "api.osv.dev"],
        ["bundleSizeGzip", "bundlephobia.com"],
    ])("tags %s request with row name and column", async (column, pattern) => {
        stubFetchByUrl({
            "registry.npmjs.org": minimalRegistryDoc,
            "api.npmjs.org/downloads": { downloads: 1 },
            "api.osv.dev": { vulns: [] },
            "bundlephobia.com": { gzip: 1 },
        });

        await fetchPackageInfo("alias-pkg", "npm:real-pkg@1.0.0", {
            visibleColumns: new Set([column]),
        });

        expect(subjectsOf(recorder.requests, pattern)).toEqual([
            subjectOf(["alias-pkg"], [column]),
        ]);
    });

    it("tags every OSV page with one shared subject", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async (url: string, init?: RequestInit) => {
                if (!url.includes("api.osv.dev")) {
                    return jsonResponse(minimalRegistryDoc);
                }
                const { page_token } = JSON.parse(String(init?.body));
                return page_token === "p2"
                    ? jsonResponse({ vulns: [] })
                    : jsonResponse({ vulns: [{ id: "A" }], next_page_token: "p2" });
            }),
        );

        await fetchPackageInfo("paged-pkg", "1.0.0", {
            visibleColumns: new Set(["vulnerabilityCount"]),
        });

        const [first, second] = subjectsOf(recorder.requests, "api.osv.dev");
        expect(first).toEqual(subjectOf(["paged-pkg"], ["vulnerabilityCount"]));
        expect(second).toBe(first);
    });

    it("lists only own pinned version row on bundle size request", async () => {
        stubFetchByUrl({ "bundlephobia.com": { gzip: 1 } });
        const options = { visibleColumns: new Set(["bundleSizeGzip", "weeklyDownloads"]) };

        await fetchPackageInfo("old-alias", "npm:real-pkg@1.0.0", options);
        await fetchPackageInfo("new-alias", "npm:real-pkg@2.0.0", options);

        expect(subjectsOf(recorder.requests, "bundlephobia.com")).toEqual([
            subjectOf(["old-alias"], ["bundleSizeGzip"]),
            subjectOf(["new-alias"], ["bundleSizeGzip"]),
        ]);
        expect(subjectsOf(recorder.requests, "api.npmjs.org/downloads")).toEqual([
            subjectOf(["old-alias", "new-alias"], ["weeklyDownloads"]),
        ]);
    });

    it("lists both packages on shared stars request", async () => {
        stubFetchByUrl({
            "registry.npmjs.org": registryDocWith({ repository: SHARED_REPO_URL }),
            "api.github.com/repos/shared-org/shared-repo": { stargazers_count: 777 },
        });
        const options = { visibleColumns: new Set(["gitStars"]) };

        await fetchPackageInfo("pkg-a", "1.0.0", options);
        await fetchPackageInfo("pkg-b", "1.0.0", options);

        expect(subjectsOf(recorder.requests, "api.github.com/repos")).toEqual([
            subjectOf(["pkg-a", "pkg-b"], ["gitStars"]),
        ]);
    });

    it("sets package to root package of latest caller", async () => {
        stubFetchByUrl({
            "registry.npmjs.org": registryDocWith({ repository: SHARED_REPO_URL }),
            "api.github.com/repos/shared-org/shared-repo": { stargazers_count: 777 },
        });
        const visibleColumns = new Set(["gitStars"]);

        await fetchPackageInfo("pkg-a", "1.0.0", { visibleColumns, rootPackage: "app-a" });
        const [subject] = subjectsOf(recorder.requests, "api.github.com/repos");
        expect(subject?.package).toBe("app-a");
        await fetchPackageInfo("pkg-b", "1.0.0", { visibleColumns, rootPackage: "app-b" });

        expect(subject?.package).toBe("app-b");
    });

    it.each([
        ["GitLab", "git+https://gitlab.com/o/r.git", "gitlab.com/api/v4/projects"],
        ["Codeberg", "https://codeberg.org/o/r", "codeberg.org/api/v1/repos"],
    ])("tags %s stars request with gitStars", async (_host, repository, pattern) => {
        stubFetchByUrl({ "registry.npmjs.org": registryDocWith({ repository }) });

        await fetchPackageInfo("pkg-a", "1.0.0", { visibleColumns: new Set(["gitStars"]) });

        expect(subjectsOf(recorder.requests, pattern)).toEqual([
            subjectOf(["pkg-a"], ["gitStars"]),
        ]);
    });

    it("tags all four issue searches with every issue column", async () => {
        stubFetchByUrl({
            "registry.npmjs.org": registryDocWith({ repository: SHARED_REPO_URL }),
            "search/issues": { total_count: 1 },
        });

        await fetchPackageInfo("pkg-a", "1.0.0", { visibleColumns: new Set(["openPRs"]) });

        const issueColumns = ["openPRs", "closedPRs", "openIssues", "closedIssues"];
        expect(subjectsOf(recorder.requests, "search/issues")).toEqual(
            Array(4).fill(subjectOf(["pkg-a"], issueColumns)),
        );
    });

    it("tags every release tag candidate with sourceCodeTree", async () => {
        stubFetchByUrl({
            "registry.npmjs.org": registryDocWith({
                repository: SHARED_REPO_URL,
                versions: { "1.0.0": {} },
            }),
            "git/ref/tags/1.0.0": { ref: "refs/tags/1.0.0" },
        });

        await fetchPackageInfo("pkg-a", "1.0.0", { visibleColumns: new Set(["sourceCodeTree"]) });

        expect(subjectsOf(recorder.requests, "git/ref/tags")).toEqual([
            subjectOf(["pkg-a"], ["sourceCodeTree"]),
            subjectOf(["pkg-a"], ["sourceCodeTree"]),
        ]);
    });

    it("starts fresh subjects after clearPackageInfoCache", async () => {
        stubFetchByUrl({
            "registry.npmjs.org": registryDocWith({ repository: SHARED_REPO_URL }),
            "api.github.com/repos": { stargazers_count: 1 },
        });
        const options = { visibleColumns: new Set(["gitStars"]) };
        await fetchPackageInfo("pkg-a", "1.0.0", options);

        clearPackageInfoCache();
        await fetchPackageInfo("pkg-b", "1.0.0", options);

        expect(subjectsOf(recorder.requests, "api.github.com/repos")).toEqual([
            subjectOf(["pkg-a"], ["gitStars"]),
            subjectOf(["pkg-b"], ["gitStars"]),
        ]);
    });
});

describe("fetchPackageInfo column gating", () => {
    it("skips security-advisory request with Vulnerabilities column hidden", async () => {
        const fetchMock = stubFetchByUrl({
            "registry.npmjs.org/no-vuln-check": minimalRegistryDoc,
            "api.npmjs.org/downloads": { downloads: 1 },
            "api.osv.dev/v1/query": { vulns: [{ id: "GHSA-should-not-be-fetched" }] },
        });

        const info = await fetchPackageInfo("no-vuln-check", "1.0.0", {
            visibleColumns: visibleColumnsExcept("vulnerabilityCount"),
        });

        expect(info.vulnerabilityCount).toBeNull();
        expect(countFetchCalls(fetchMock, "api.osv.dev")).toBe(0);
    });

    it("skips Bundlephobia request with Bundle size column hidden", async () => {
        const fetchMock = stubFetchByUrl({
            "registry.npmjs.org/no-bundle-check": minimalRegistryDoc,
            "api.npmjs.org/downloads": { downloads: 1 },
            "bundlephobia.com/api/size": { gzip: 4096 },
        });

        const info = await fetchPackageInfo("no-bundle-check", "1.0.0", {
            visibleColumns: visibleColumnsExcept("bundleSizeGzip"),
        });

        expect(info.bundleSizeGzip).toBeNull();
        expect(countFetchCalls(fetchMock, "bundlephobia.com")).toBe(0);
    });

    it("skips npm downloads request with Weekly downloads column hidden", async () => {
        const fetchMock = stubFetchByUrl({
            "registry.npmjs.org/no-downloads-check": minimalRegistryDoc,
            "api.npmjs.org/downloads": { downloads: 99999 },
        });

        const info = await fetchPackageInfo("no-downloads-check", "1.0.0", {
            visibleColumns: visibleColumnsExcept("weeklyDownloads"),
        });

        expect(info.weeklyDownloads).toBeNull();
        expect(countFetchCalls(fetchMock, "api.npmjs.org/downloads")).toBe(0);
    });

    it("skips repo metadata request with repo columns hidden, License visible", async () => {
        const fetchMock = vi.fn(async (url: string) => {
            if (url.includes("registry.npmjs.org/license-only")) {
                return jsonResponse({
                    "dist-tags": { latest: "1.0.0" },
                    time: {},
                    repository: {
                        type: "git",
                        url: "git+https://github.com/some-org/some-repo.git",
                    },
                    versions: { "1.0.0": { license: "MIT" } },
                });
            }
            if (url.includes("api.npmjs.org/downloads")) {
                return jsonResponse({ downloads: 1 });
            }
            return jsonResponse(null, false);
        });
        vi.stubGlobal("fetch", fetchMock);

        const info = await fetchPackageInfo("license-only", "1.0.0", {
            visibleColumns: visibleColumnsExcept(
                "gitStars",
                "lastCommitDate",
                "openPRs",
                "closedPRs",
                "openIssues",
                "closedIssues",
                "sourceCodeTree",
            ),
        });

        expect(info.license).toBe("MIT");
        expect(info.gitStars).toBeNull();
        expect(countFetchCalls(fetchMock, "registry.npmjs.org/license-only")).toBe(1);
        expect(countFetchCalls(fetchMock, "api.github.com")).toBe(0);
    });

    it("skips npm registry request with all registry columns hidden", async () => {
        const fetchMock = stubFetchByUrl({
            "registry.npmjs.org/registry-not-needed": {
                "dist-tags": { latest: "1.0.0" },
                time: {},
            },
            "api.npmjs.org/downloads": { downloads: 1 },
        });

        const info = await fetchPackageInfo("registry-not-needed", "1.0.0", {
            visibleColumns: visibleColumnsExcept(
                "versionDate",
                "latestVersion",
                "latestReleaseDate",
                "latestUpdateDate",
                "dependencies",
                "license",
                "deprecated",
                "isOutdated",
                "healthScore",
                "maintainers",
                "sourceCode",
                "sourceCodeTree",
                "gitStars",
                "lastCommitDate",
                "openPRs",
                "closedPRs",
                "openIssues",
                "closedIssues",
            ),
        });

        expect(info.sourceCode).toBeNull();
        expect(info.latestVersion).toBeNull();
        expect(info.healthScore).toBeNull();
        expect(info.healthSignals).toBeNull();
        expect(countFetchCalls(fetchMock, "registry.npmjs.org/registry-not-needed")).toBe(0);
        // Weekly downloads wasn't hidden, so that call still goes out independently.
        expect(countFetchCalls(fetchMock, "api.npmjs.org/downloads")).toBe(1);
    });

    it("scores health from registry document alone with only healthScore visible", async () => {
        const fetchMock = stubFetchByUrl({
            "registry.npmjs.org/health-only": {
                "dist-tags": { latest: "1.0.0" },
                time: { "1.0.0": new Date().toISOString() },
                repository: "https://github.com/health/only",
                maintainers: [{ name: "alice" }],
                versions: { "1.0.0": {} },
            },
        });

        const info = await fetchPackageInfo("health-only", "1.0.0", {
            visibleColumns: new Set(["healthScore"]),
        });

        // Fresh, current, not deprecated: only the single maintainer costs points.
        expect(info.healthScore).toBe(92);
        expect(info.healthSignals).toEqual(["releaseAge", "deprecated", "outdated", "maintainers"]);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(countFetchCalls(fetchMock, "registry.npmjs.org/health-only")).toBe(1);
    });

    it("lowers health score for deprecated version with vulnerabilities", async () => {
        stubFetchByUrl({
            "registry.npmjs.org/unhealthy": {
                "dist-tags": { latest: "1.0.0" },
                time: { "1.0.0": new Date().toISOString() },
                versions: { "1.0.0": { deprecated: "no longer maintained" } },
            },
            "api.osv.dev/v1/query": { vulns: [{ id: "GHSA-1" }] },
        });

        const info = await fetchPackageInfo("unhealthy", "1.0.0", {
            visibleColumns: new Set(["healthScore", "vulnerabilityCount"]),
        });

        // Weights: release age 3 + outdated 2 healthy, of 13 with deprecated 6 + vulnerabilities 2.
        expect(info.healthScore).toBe(38);
        expect(info.healthSignals).toEqual([
            "releaseAge",
            "deprecated",
            "outdated",
            "vulnerabilities",
        ]);
    });

    it("leaves health score null for unknown package", async () => {
        stubFetchByUrl({});

        const info = await fetchPackageInfo("missing-pkg", "1.0.0", {
            visibleColumns: new Set(["healthScore"]),
        });

        expect(info.healthScore).toBeNull();
        expect(info.healthSignals).toBeNull();
    });

    it("fetches everything without visibleColumns", async () => {
        const fetchMock = stubFetchByUrl({
            "registry.npmjs.org/default-visible": minimalRegistryDoc,
            "api.npmjs.org/downloads": { downloads: 1 },
            "api.osv.dev/v1/query": { vulns: [] },
            "bundlephobia.com/api/size": { gzip: 10 },
        });

        const info = await fetchPackageInfo("default-visible", "1.0.0");

        expect(info.weeklyDownloads).toBe(1);
        expect(info.vulnerabilityCount).toBe(0);
        expect(info.bundleSizeGzip).toBe(10);
        expect(countFetchCalls(fetchMock, "registry.npmjs.org/default-visible")).toBe(1);
    });
});

describe("fetchPackageJsonForVersion", () => {
    it("tags registry request with row name, no columns", async () => {
        stubFetchByUrl({ "registry.npmjs.org/real-pkg": minimalRegistryDoc });
        const recorder = recordRequests();

        await fetchPackageJsonForVersion("alias-pkg", "npm:real-pkg@1.0.0");
        recorder.stop();

        expect(subjectsOf(recorder.requests, "registry.npmjs.org")).toEqual([
            subjectOf(["alias-pkg"], []),
        ]);
    });

    it("returns exact version manifest, including unparsed fields like devDependencies", async () => {
        stubFetchByUrl({
            "registry.npmjs.org/drill-pkg": {
                "dist-tags": { latest: "2.0.0" },
                time: {},
                versions: {
                    "1.0.0": {
                        name: "drill-pkg",
                        version: "1.0.0",
                        dependencies: { a: "^1.0.0" },
                        devDependencies: { b: "^1.0.0" },
                    },
                    "2.0.0": { name: "drill-pkg", version: "2.0.0" },
                },
            },
        });

        const json = await fetchPackageJsonForVersion("drill-pkg", "1.0.0");

        expect(JSON.parse(json!)).toEqual({
            name: "drill-pkg",
            version: "1.0.0",
            dependencies: { a: "^1.0.0" },
            devDependencies: { b: "^1.0.0" },
        });
    });

    it("falls back to latest version for declared version not in registry", async () => {
        stubFetchByUrl({
            "registry.npmjs.org/drill-pkg-2": {
                "dist-tags": { latest: "3.0.0" },
                time: {},
                versions: {
                    "3.0.0": {
                        name: "drill-pkg-2",
                        version: "3.0.0",
                        dependencies: { c: "^1.0.0" },
                    },
                },
            },
        });

        const json = await fetchPackageJsonForVersion("drill-pkg-2", "^2.0.0");

        expect(JSON.parse(json!)).toMatchObject({ version: "3.0.0" });
    });

    it("returns null for unresolvable package", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => jsonResponse(null, false)),
        );

        const json = await fetchPackageJsonForVersion("missing-pkg", "1.0.0");

        expect(json).toBeNull();
    });

    it("reuses fetchPackageInfo registry cache, no extra request", async () => {
        const fetchMock = stubFetchByUrl({
            "registry.npmjs.org/shared-drill-pkg": {
                "dist-tags": { latest: "1.0.0" },
                time: {},
                versions: { "1.0.0": { name: "shared-drill-pkg", version: "1.0.0" } },
            },
            "api.npmjs.org/downloads": { downloads: 1 },
        });

        await fetchPackageInfo("shared-drill-pkg", "1.0.0");
        const json = await fetchPackageJsonForVersion("shared-drill-pkg", "1.0.0");

        expect(JSON.parse(json!)).toMatchObject({ name: "shared-drill-pkg" });
        const registryCalls = fetchMock.mock.calls.filter(([url]: [string]) =>
            url.includes("registry.npmjs.org/shared-drill-pkg"),
        );
        expect(registryCalls).toHaveLength(1);
    });
});

describe("fetchPackagesInfo", () => {
    it("resolves every package, reports failures per package, no batch reject", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async (url: string) => {
                if (url.includes("registry.npmjs.org/good")) {
                    return jsonResponse(minimalRegistryDoc);
                }
                if (url.includes("registry.npmjs.org/bad")) {
                    throw new Error("network down");
                }
                if (url.includes("api.npmjs.org/downloads")) {
                    return jsonResponse({ downloads: 1 });
                }
                return jsonResponse(null, false);
            }),
        );

        const results = await fetchPackagesInfo([
            { name: "good", version: "1.0.0" },
            { name: "bad", version: "1.0.0" },
        ]);

        expect(results).toHaveLength(2);
        expect(results?.[0]).toMatchObject({ name: "good" });
        expect(results?.[1]).toMatchObject({ name: "bad", error: "network down" });
    });

    it("starts no package once isCancelled true, returns null", async () => {
        const fetchMock = stubFetchByUrl({ "api.npmjs.org/downloads": { downloads: 1 } });

        const results = await fetchPackagesInfo(
            [
                { name: "first", version: "1.0.0" },
                { name: "second", version: "1.0.0" },
            ],
            {
                concurrency: 1,
                visibleColumns: new Set(["weeklyDownloads"]),
                isCancelled: () => fetchMock.mock.calls.length > 0,
            },
        );

        expect(countFetchCalls(fetchMock, "/first")).toBe(1);
        expect(countFetchCalls(fetchMock, "/second")).toBe(0);
        expect(results).toBeNull();
    });

    it("returns rows once every package started before cancel", async () => {
        stubFetchByUrl({ "api.npmjs.org/downloads": { downloads: 1 } });
        let isCancelled = false;

        const request = fetchPackagesInfo([{ name: "only", version: "1.0.0" }], {
            visibleColumns: new Set(["weeklyDownloads"]),
            isCancelled: () => isCancelled,
        });
        isCancelled = true;

        expect(await request).toEqual([expect.objectContaining({ name: "only" })]);
    });
});

describe("fetchPackageInfo failures", () => {
    const registryDoc = {
        "dist-tags": { latest: "1.0.0" },
        time: {},
        repository: "git+https://github.com/o/r.git",
        versions: { "1.0.0": {} },
    };

    function failingFetch(
        failPattern: string,
        failure: "status" | "network",
        status: number = HTTP_STATUS.serviceUnavailable,
    ) {
        return vi.fn(async (url: string) => {
            if (url.includes(failPattern)) {
                if (failure === "network") {
                    throw new TypeError("Failed to fetch");
                }
                return statusResponse(status);
            }
            if (url.includes("registry.npmjs.org")) {
                return jsonResponse(registryDoc);
            }
            if (url.includes("api.npmjs.org/downloads")) {
                return jsonResponse({ downloads: 7 });
            }
            if (url.includes("search/issues")) {
                return jsonResponse({ total_count: 2 });
            }
            if (url.includes("/commits")) {
                return jsonResponse([{ commit: { committer: { date: "2024-01-01T00:00:00Z" } } }]);
            }
            if (url.includes("api.github.com/repos")) {
                return jsonResponse({ stargazers_count: 9 });
            }
            return jsonResponse(null, false);
        });
    }

    it("keeps row with null downloads on downloads server error", async () => {
        vi.stubGlobal("fetch", failingFetch("api.npmjs.org/downloads", "status"));

        const info = await fetchPackageInfo("pkg", "1.0.0");

        expect(info.weeklyDownloads).toBeNull();
        expect(info.gitStars).toBe(9);
    });

    it("keeps row with null downloads on network failure", async () => {
        vi.stubGlobal("fetch", failingFetch("api.npmjs.org/downloads", "network"));

        const info = await fetchPackageInfo("pkg", "1.0.0");

        expect(info.weeklyDownloads).toBeNull();
        expect(info.latestVersion).toBe("1.0.0");
    });

    it("keeps npm data with null stars on repo host network failure", async () => {
        vi.stubGlobal("fetch", failingFetch("api.github.com", "network"));

        const info = await fetchPackageInfo("pkg", "1.0.0");

        expect(info.gitStars).toBeNull();
        expect(info.weeklyDownloads).toBe(7);
    });

    it("retries failed downloads lookup on next fetch instead of caching null", async () => {
        const fetchMock = failingFetch("api.npmjs.org/downloads", "status");
        vi.stubGlobal("fetch", fetchMock);

        await fetchPackageInfo("pkg", "1.0.0");
        await fetchPackageInfo("pkg", "1.0.0");

        expect(countFetchCalls(fetchMock, "api.npmjs.org/downloads")).toBe(2);
    });

    it("keeps stars with null issue counts on rate-limited search", async () => {
        vi.stubGlobal("fetch", failingFetch("search/issues", "status", HTTP_STATUS.forbidden));

        const info = await fetchPackageInfo("pkg", "1.0.0");

        expect(info.gitStars).toBe(9);
        expect(info.openPRs).toBeNull();
        expect(info.closedIssues).toBeNull();
    });

    it("marks failed downloads lookup with its error", async () => {
        vi.stubGlobal("fetch", failingFetch("api.npmjs.org/downloads", "status"));

        const info = await fetchPackageInfo("pkg", "1.0.0");

        expect(info.failedLookups).toEqual({
            weeklyDownloads: "Request failed with status 503",
        });
        expect(info.staleSince).toBeNull();
    });

    it("marks every issue count column on failed search", async () => {
        vi.stubGlobal("fetch", failingFetch("search/issues", "network"));

        const info = await fetchPackageInfo("pkg", "1.0.0");

        expect(info.failedLookups).toEqual({
            openPRs: "Failed to fetch",
            closedPRs: "Failed to fetch",
            openIssues: "Failed to fetch",
            closedIssues: "Failed to fetch",
        });
    });

    it("leaves failedLookups null for live 404", async () => {
        vi.stubGlobal(
            "fetch",
            failingFetch("api.npmjs.org/downloads", "status", HTTP_STATUS.notFound),
        );

        const info = await fetchPackageInfo("pkg", "1.0.0");

        expect(info.weeklyDownloads).toBeNull();
        expect(info.failedLookups).toBeNull();
    });

    it("rejects on registry server error, retries on next fetch", async () => {
        const fetchMock = failingFetch("registry.npmjs.org", "status");
        vi.stubGlobal("fetch", fetchMock);

        await expect(fetchPackageInfo("pkg", "1.0.0")).rejects.toThrow("503");
        await expect(fetchPackageInfo("pkg", "1.0.0")).rejects.toThrow("503");
        expect(countFetchCalls(fetchMock, "registry.npmjs.org")).toBe(2);
    });

    describe("offline store", () => {
        const SAVED_OLD = "2024-01-01T00:00:00.000Z";
        const SAVED_NEW = "2024-02-01T00:00:00.000Z";

        /** Saves a lookup value as if fetched live at `savedAt`. */
        async function seedLookup(kind: LookupKind, key: string, value: unknown, savedAt: string) {
            vi.setSystemTime(new Date(savedAt));
            await saveLookup(kind, key, value);
        }

        beforeEach(() => {
            stubIndexedDb();
            // Date only: fake-indexeddb schedules its work on real timers.
            vi.useFakeTimers({ toFake: ["Date"] });
        });

        afterEach(() => {
            vi.useRealTimers();
            resetSettings();
        });

        it("saves live values", async () => {
            vi.stubGlobal("fetch", failingFetch("no-such-host", "status"));

            const info = await fetchPackageInfo("pkg", "1.0.0");

            expect(info.staleSince).toBeNull();
            await vi.waitFor(async () => {
                expect(await loadLookup("weeklyDownloads", "pkg")).toMatchObject({ value: 7 });
                expect(await loadLookup("repoStars", "github.com/o/r")).toMatchObject({ value: 9 });
                expect(await loadLookup("registry", "pkg")).toBeDefined();
            });
        });

        it("returns stored value marked stale on rejected optional lookup", async () => {
            await seedLookup("weeklyDownloads", "pkg", 42, SAVED_OLD);
            vi.stubGlobal("fetch", failingFetch("api.npmjs.org/downloads", "network"));

            const info = await fetchPackageInfo("pkg", "1.0.0");

            expect(info.weeklyDownloads).toBe(42);
            expect(info.gitStars).toBe(9);
            expect(info.staleSince).toBe(SAVED_OLD);
            expect(info.failedLookups).toBeNull();
        });

        it("returns stored commit activity marked stale on rejected lookup", async () => {
            const stored = { lastCommitDate: "2023-05-05T00:00:00Z", commitsLastYear: 5 };
            await seedLookup("repoCommits", "github.com/o/r", stored, SAVED_OLD);
            vi.stubGlobal("fetch", failingFetch("/commits", "network"));

            const info = await fetchPackageInfo("pkg", "1.0.0");

            expect(info).toMatchObject({ ...stored, staleSince: SAVED_OLD });
            expect(info.failedLookups).toBeNull();
        });

        it("builds row from stored registry document on registry outage", async () => {
            await seedLookup("registry", "pkg", registryDoc, SAVED_OLD);
            vi.stubGlobal("fetch", failingFetch("registry.npmjs.org", "status"));

            const info = await fetchPackageInfo("pkg", "1.0.0");

            expect(info.latestVersion).toBe("1.0.0");
            expect(info.staleSince).toBe(SAVED_OLD);
        });

        it("rethrows live error on store miss", async () => {
            vi.stubGlobal("fetch", failingFetch("registry.npmjs.org", "status"));

            await expect(fetchPackageInfo("pkg", "1.0.0")).rejects.toThrow("503");
        });

        it("keeps live null fresh over stored value", async () => {
            await seedLookup("weeklyDownloads", "pkg", 42, SAVED_OLD);
            vi.stubGlobal(
                "fetch",
                failingFetch("api.npmjs.org/downloads", "status", HTTP_STATUS.notFound),
            );

            const info = await fetchPackageInfo("pkg", "1.0.0");

            expect(info.weeklyDownloads).toBeNull();
            expect(info.staleSince).toBeNull();
        });

        it("retries live after stale result instead of memoizing it", async () => {
            await seedLookup("registry", "pkg", registryDoc, SAVED_OLD);
            const fetchMock = failingFetch("registry.npmjs.org", "status");
            vi.stubGlobal("fetch", fetchMock);

            await fetchPackageInfo("pkg", "1.0.0");
            await fetchPackageInfo("pkg", "1.0.0");

            expect(countFetchCalls(fetchMock, "registry.npmjs.org")).toBe(2);
        });

        it("returns fresh row once live lookup recovers", async () => {
            await seedLookup("weeklyDownloads", "pkg", 42, SAVED_OLD);
            vi.stubGlobal("fetch", failingFetch("api.npmjs.org/downloads", "network"));
            await fetchPackageInfo("pkg", "1.0.0");
            vi.stubGlobal("fetch", failingFetch("no-such-host", "status"));

            const info = await fetchPackageInfo("pkg", "1.0.0");

            expect(info.weeklyDownloads).toBe(7);
            expect(info.staleSince).toBeNull();
        });

        it("sets staleSince to oldest stored lookup used", async () => {
            await seedLookup("weeklyDownloads", "pkg", 42, SAVED_NEW);
            await seedLookup("registry", "pkg", registryDoc, SAVED_OLD);
            vi.stubGlobal("fetch", failingFetch("npmjs.org", "network"));

            const info = await fetchPackageInfo("pkg", "1.0.0");

            expect(info.weeklyDownloads).toBe(42);
            expect(info.staleSince).toBe(SAVED_OLD);
        });

        it("fills issue counts from store, scores health with them", async () => {
            const counts = { openPRs: 1, closedPRs: 2, openIssues: 0, closedIssues: 4 };
            await seedLookup("repoIssueCounts", "github.com/o/r", counts, SAVED_OLD);
            vi.stubGlobal("fetch", failingFetch("search/issues", "network"));

            const info = await fetchPackageInfo("pkg", "1.0.0", {
                visibleColumns: new Set(["openIssues", "closedIssues", "healthScore"]),
            });

            expect(info).toMatchObject({ ...counts, staleSince: SAVED_OLD });
            expect(info.healthSignals).toContain("issues");
        });

        it("builds GitHub source tree from stored release tag", async () => {
            await seedLookup("githubReleaseTag", "github.com/o/r@1.0.0", "v1.0.0", SAVED_OLD);
            vi.stubGlobal("fetch", failingFetch("git/ref/tags", "network"));

            const info = await fetchPackageInfo("pkg", "1.0.0", {
                visibleColumns: new Set(["sourceCodeTree"]),
            });

            expect(info.sourceTree).toEqual({
                provider: "github",
                owner: "o",
                repo: "r",
                tag: "v1.0.0",
            });
            expect(info.staleSince).toBe(SAVED_OLD);
        });

        it("returns live row while IndexedDB save hangs", async () => {
            vi.stubGlobal("indexedDB", { open: () => ({}) });
            vi.stubGlobal("fetch", failingFetch("no-such-host", "status"));

            const info = await fetchPackageInfo("pkg", "1.0.0", {
                visibleColumns: new Set(["weeklyDownloads"]),
            });

            expect(info.weeklyDownloads).toBe(7);
        });

        it("ignores stored value of wrong shape", async () => {
            await seedLookup("weeklyDownloads", "pkg", "lots", SAVED_OLD);
            vi.stubGlobal("fetch", failingFetch("api.npmjs.org/downloads", "network"));

            const info = await fetchPackageInfo("pkg", "1.0.0");

            expect(info.weeklyDownloads).toBeNull();
            expect(info.staleSince).toBeNull();
        });

        it("reads malformed stored registry field as missing", async () => {
            await seedLookup("registry", "pkg", { ...registryDoc, maintainers: "x" }, SAVED_OLD);
            vi.stubGlobal("fetch", failingFetch("registry.npmjs.org", "network"));

            const info = await fetchPackageInfo("pkg", "1.0.0");

            expect(info.maintainers).toBeNull();
            expect(info.staleSince).toBe(SAVED_OLD);
        });

        it("skips save of lookup in flight at clearLookups", async () => {
            let releaseDownloads = (_response: unknown) => {};
            vi.stubGlobal(
                "fetch",
                vi.fn(
                    () =>
                        new Promise((resolve) => {
                            releaseDownloads = resolve;
                        }),
                ),
            );
            const request = fetchPackageInfo("pkg", "1.0.0", {
                visibleColumns: new Set(["weeklyDownloads"]),
            });

            await clearLookups();
            releaseDownloads(jsonResponse({ downloads: 7 }));
            expect((await request).weeklyDownloads).toBe(7);
            // Transactions commit in order: once this save lands, an earlier one would have too.
            await saveLookup("weeklyDownloads", "later-pkg", 1);

            expect(await loadLookup("weeklyDownloads", "pkg")).toBeUndefined();
        });

        it("serves drill-down manifest from stored registry document", async () => {
            await seedLookup("registry", "pkg", registryDoc, SAVED_OLD);
            vi.stubGlobal("fetch", failingFetch("registry.npmjs.org", "network"));

            expect(await fetchPackageJsonForVersion("pkg", "1.0.0")).toBe("{}");
        });

        it("stores no request headers or token", async () => {
            const put = vi.spyOn(IDBObjectStore.prototype, "put");
            githubToken.value = TOKEN;
            vi.stubGlobal("fetch", failingFetch("no-such-host", "status"));

            await fetchPackageInfo("pkg", "1.0.0");

            await vi.waitFor(() => expect(put.mock.calls.length).toBeGreaterThan(0));
            expect(JSON.stringify(put.mock.calls)).not.toContain(TOKEN);
        });
    });
});

describe("fetchPackageInfo input edge cases", () => {
    it("looks up real package for npm alias spec", async () => {
        const fetchMock = stubFetchByUrl({
            "registry.npmjs.org/real-pkg": {
                "dist-tags": { latest: "2.0.0" },
                time: { "2.0.0": "2022-01-01T00:00:00.000Z" },
                versions: { "2.0.0": { dependencies: { dep: "1.0.0" } } },
            },
        });

        const info = await fetchPackageInfo("my-alias", "npm:real-pkg@2.0.0");

        expect(info.name).toBe("my-alias");
        expect(info.versionDate).toBe("2022-01-01T00:00:00.000Z");
        expect(info.dependencies).toEqual(["dep"]);
        expect(countFetchCalls(fetchMock, "registry.npmjs.org/my-alias")).toBe(0);
    });

    it("uses leading version of caret range for date and version data", async () => {
        stubFetchByUrl({
            "registry.npmjs.org/ranged": {
                "dist-tags": { latest: "2.0.0" },
                time: { "1.2.3": "2021-01-01T00:00:00.000Z" },
                versions: {
                    "1.2.3": { dependencies: { old: "1.0.0" }, deprecated: "old" },
                    "2.0.0": { dependencies: { new: "1.0.0" } },
                },
            },
        });

        const info = await fetchPackageInfo("ranged", "^1.2.3");

        expect(info.versionDate).toBe("2021-01-01T00:00:00.000Z");
        expect(info.dependencies).toEqual(["old"]);
        expect(info.deprecated).toBe("old");
    });

    it("drops non-http homepage as source link", async () => {
        stubFetchByUrl({
            "registry.npmjs.org/evil": {
                "dist-tags": { latest: "1.0.0" },
                homepage: "javascript:alert(1)",
            },
        });

        const info = await fetchPackageInfo("evil", "1.0.0");

        expect(info.sourceCode).toBeNull();
    });

    it("skips GitHub tag lookup for non-semver range", async () => {
        const fetchMock = stubFetchByUrl({
            "registry.npmjs.org/tagless": {
                "dist-tags": { latest: "1.0.0" },
                repository: "github:o/tagless",
                versions: { "1.0.0": {} },
            },
        });

        const info = await fetchPackageInfo("tagless", "latest");

        expect(info.sourceTree).toBeNull();
        expect(countFetchCalls(fetchMock, "git/ref/tags")).toBe(0);
    });

    it("looks up tag by leading version of caret range", async () => {
        const fetchMock = vi.fn(async (url: string) => {
            if (url.includes("registry.npmjs.org")) {
                return jsonResponse({
                    "dist-tags": { latest: "1.2.3" },
                    repository: "github:o/r",
                    versions: { "1.2.3": {} },
                });
            }
            return jsonResponse({}, url.endsWith("/git/ref/tags/v1.2.3"));
        });
        vi.stubGlobal("fetch", fetchMock);

        const info = await fetchPackageInfo("r", "^1.2.3");

        expect(info.sourceTree).toEqual({
            provider: "github",
            owner: "o",
            repo: "r",
            tag: "v1.2.3",
        });
    });
});

describe("fetchPackageInfo malformed registry data", () => {
    const validPart = {
        "dist-tags": { latest: "1.0.0" },
        time: { "1.0.0": "2022-01-01T00:00:00.000Z" },
        versions: { "1.0.0": { dependencies: { dep: "1.0.0" } } },
    };

    it.each([
        ["repository.url number", { repository: { url: 5 } }],
        ["repository array", { repository: [] }],
        ["maintainers string", { maintainers: "alice" }],
        ["maintainers null item", { maintainers: [null] }],
        ["homepage object", { homepage: {} }],
        ["license number type", { license: { type: 3 } }],
    ])("keeps row, reads %s as missing", async (_label, malformedPart) => {
        stubFetchByUrl({ "registry.npmjs.org/odd": { ...validPart, ...malformedPart } });

        const info = await fetchPackageInfo("odd", "1.0.0");

        expect(info.latestVersion).toBe("1.0.0");
        expect(info.versionDate).toBe("2022-01-01T00:00:00.000Z");
        expect(info.dependencies).toEqual(["dep"]);
        expect(info.sourceCode).toBeNull();
        expect(info.maintainers).toBeNull();
        expect(info.license).toBeNull();
    });

    it("keeps valid maintainers beside malformed ones", async () => {
        stubFetchByUrl({
            "registry.npmjs.org/odd": { ...validPart, maintainers: [null, { name: "bob" }, 7] },
        });

        const info = await fetchPackageInfo("odd", "1.0.0");

        expect(info.maintainers).toEqual(["bob"]);
    });

    it("reads non-string dist-tags.latest, time value as missing", async () => {
        stubFetchByUrl({
            "registry.npmjs.org/odd": {
                ...validPart,
                "dist-tags": { latest: 5 },
                time: { "1.0.0": 1640995200000, modified: "2022-02-02T00:00:00.000Z" },
            },
        });

        const info = await fetchPackageInfo("odd", "1.0.0");

        expect(info.latestVersion).toBeNull();
        expect(info.isOutdated).toBeNull();
        expect(info.versionDate).toBeNull();
        expect(info.latestUpdateDate).toBe("2022-02-02T00:00:00.000Z");
    });

    it("reads malformed version fields as missing", async () => {
        stubFetchByUrl({
            "registry.npmjs.org/odd": {
                ...validPart,
                versions: {
                    "1.0.0": {
                        dependencies: "abc",
                        deprecated: false,
                        license: { type: 3 },
                        dist: { tarball: 9 },
                    },
                },
            },
        });

        const info = await fetchPackageInfo("odd", "1.0.0");

        expect(info.dependencies).toBeNull();
        expect(info.deprecated).toBeNull();
        expect(info.license).toBeNull();
        expect(info.sourceTree).toBeNull();
    });

    it.each([
        ["array", []],
        ["string", "oops"],
        ["null version entry", { ...validPart, versions: { "1.0.0": null } }],
    ])("resolves row for %s document", async (_label, doc) => {
        stubFetchByUrl({ "registry.npmjs.org/odd": doc });

        const info = await fetchPackageInfo("odd", "1.0.0");

        expect(info.name).toBe("odd");
        expect(info.dependencies).toBeNull();
    });

    it("drill-down keeps whole raw manifest", async () => {
        stubFetchByUrl({
            "registry.npmjs.org/odd": {
                ...validPart,
                versions: { "1.0.0": { name: "odd", scripts: { test: "x" }, deprecated: false } },
            },
        });

        const text = await fetchPackageJsonForVersion("odd", "1.0.0");

        expect(JSON.parse(text!)).toEqual({
            name: "odd",
            scripts: { test: "x" },
            deprecated: false,
        });
    });
});
