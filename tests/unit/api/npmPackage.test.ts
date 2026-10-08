import { describe, it, expect, vi, beforeEach } from "vitest";
import {
    fetchPackageInfo,
    fetchPackagesInfo,
    fetchPackageJsonForVersion,
    clearPackageInfoCache,
} from "../../../src/api/npmPackage";
import { columnKeysExcept } from "../../helpers/columns";
import { countFetchCalls, jsonResponse, mockFetchByUrl } from "../../helpers/fetchMock";

function visibleColumnsExcept(...excluded: string[]): Set<string> {
    return new Set(columnKeysExcept(...excluded));
}

beforeEach(() => {
    vi.unstubAllGlobals();
    clearPackageInfoCache();
});

describe("fetchPackageInfo", () => {
    it("resolves npm registry, downloads, GitHub data for GitHub repository", async () => {
        vi.stubGlobal(
            "fetch",
            mockFetchByUrl({
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
                "api.github.com/repos/left-pad/left-pad": { stargazers_count: 99 },
                "is:pr+is:open": { total_count: 2 },
                "is:pr+is:closed": { total_count: 10 },
                "is:issue+is:open": { total_count: 3 },
                "is:issue+is:closed": { total_count: 20 },
            }),
        );

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
            openPRs: 2,
            closedPRs: 10,
            openIssues: 3,
            closedIssues: 20,
            dependencies: ["tiny-dep"],
            license: null,
            isOutdated: true,
            deprecated: null,
            vulnerabilityCount: null,
            bundleSizeGzip: null,
            maintainers: null,
            sourceTree: {
                provider: "npm",
                tarballUrl: "https://registry.npmjs.org/left-pad/-/left-pad-1.2.0.tgz",
            },
        });
    });

    it("falls back to latest version dependencies for unknown installed version", async () => {
        vi.stubGlobal(
            "fetch",
            mockFetchByUrl({
                "registry.npmjs.org/foo": {
                    "dist-tags": { latest: "2.0.0" },
                    time: {},
                    versions: {
                        "2.0.0": { dependencies: { bar: "^1.0.0" } },
                    },
                },
                "api.npmjs.org/downloads": { downloads: 0 },
            }),
        );

        const info = await fetchPackageInfo("foo", "^1.0.0");

        expect(info.dependencies).toEqual(["bar"]);
    });

    it("leaves GitHub-derived fields null without repository", async () => {
        vi.stubGlobal(
            "fetch",
            mockFetchByUrl({
                "registry.npmjs.org/no-repo": {
                    "dist-tags": { latest: "1.0.0" },
                    time: {},
                },
                "api.npmjs.org/downloads": { downloads: 5 },
            }),
        );

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
        vi.stubGlobal(
            "fetch",
            mockFetchByUrl({
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
            }),
        );

        const info = await fetchPackageInfo("gl-pkg", "1.0.0");

        expect(info.sourceCode).toBe("https://gitlab.com/some-group/gl-pkg");
        expect(info.gitStars).toBe(55);
        expect(info.openPRs).toBeNull();
        expect(info.closedPRs).toBeNull();
        expect(info.openIssues).toBeNull();
        expect(info.closedIssues).toBeNull();
    });

    it("resolves stars from Codeberg for Codeberg repository", async () => {
        vi.stubGlobal(
            "fetch",
            mockFetchByUrl({
                "registry.npmjs.org/cb-pkg": {
                    "dist-tags": { latest: "1.0.0" },
                    time: {},
                    repository: { type: "git", url: "https://codeberg.org/some-org/cb-pkg" },
                },
                "api.npmjs.org/downloads": { downloads: 3 },
                "codeberg.org/api/v1/repos/some-org/cb-pkg": { stars_count: 12 },
            }),
        );

        const info = await fetchPackageInfo("cb-pkg", "1.0.0");

        expect(info.sourceCode).toBe("https://codeberg.org/some-org/cb-pkg");
        expect(info.gitStars).toBe(12);
    });

    it("extracts license, deprecation notice, maintainers from registry response", async () => {
        vi.stubGlobal(
            "fetch",
            mockFetchByUrl({
                "registry.npmjs.org/rich-meta": {
                    "dist-tags": { latest: "1.0.0" },
                    time: {},
                    maintainers: [{ name: "alice" }, { name: "bob" }],
                    versions: {
                        "1.0.0": { license: "MIT", deprecated: "use rich-meta-v2 instead" },
                    },
                },
                "api.npmjs.org/downloads": { downloads: 0 },
            }),
        );

        const info = await fetchPackageInfo("rich-meta", "1.0.0");

        expect(info.license).toBe("MIT");
        expect(info.deprecated).toBe("use rich-meta-v2 instead");
        expect(info.maintainers).toEqual(["alice", "bob"]);
    });

    it("falls back to package-level license without version license", async () => {
        vi.stubGlobal(
            "fetch",
            mockFetchByUrl({
                "registry.npmjs.org/pkg-level-license": {
                    "dist-tags": { latest: "1.0.0" },
                    time: {},
                    license: "Apache-2.0",
                    versions: { "1.0.0": {} },
                },
                "api.npmjs.org/downloads": { downloads: 0 },
            }),
        );

        const info = await fetchPackageInfo("pkg-level-license", "1.0.0");

        expect(info.license).toBe("Apache-2.0");
    });

    it("marks package up to date for latest declared version", async () => {
        vi.stubGlobal(
            "fetch",
            mockFetchByUrl({
                "registry.npmjs.org/current-pkg": {
                    "dist-tags": { latest: "2.0.0" },
                    time: {},
                },
                "api.npmjs.org/downloads": { downloads: 0 },
            }),
        );

        const info = await fetchPackageInfo("current-pkg", "^2.0.0");

        expect(info.isOutdated).toBe(false);
    });

    it("reports vulnerability count from OSV", async () => {
        vi.stubGlobal(
            "fetch",
            mockFetchByUrl({
                "registry.npmjs.org/vulnerable-pkg": { "dist-tags": { latest: "1.0.0" }, time: {} },
                "api.npmjs.org/downloads": { downloads: 0 },
                "api.osv.dev/v1/query": {
                    vulns: [{ id: "GHSA-aaaa-bbbb-cccc" }, { id: "GHSA-dddd-eeee-ffff" }],
                },
            }),
        );

        const info = await fetchPackageInfo("vulnerable-pkg", "1.0.0");

        expect(info.vulnerabilityCount).toBe(2);
    });

    it("reports 0 vulnerabilities, not null, for empty OSV response", async () => {
        vi.stubGlobal(
            "fetch",
            mockFetchByUrl({
                "registry.npmjs.org/clean-pkg": { "dist-tags": { latest: "1.0.0" }, time: {} },
                "api.npmjs.org/downloads": { downloads: 0 },
                "api.osv.dev/v1/query": { vulns: [] },
            }),
        );

        const info = await fetchPackageInfo("clean-pkg", "1.0.0");

        expect(info.vulnerabilityCount).toBe(0);
    });

    it("reports gzip bundle size from Bundlephobia", async () => {
        vi.stubGlobal(
            "fetch",
            mockFetchByUrl({
                "registry.npmjs.org/sized-pkg": { "dist-tags": { latest: "1.0.0" }, time: {} },
                "api.npmjs.org/downloads": { downloads: 0 },
                "bundlephobia.com/api/size": { gzip: 2048 },
            }),
        );

        const info = await fetchPackageInfo("sized-pkg", "1.0.0");

        expect(info.bundleSizeGzip).toBe(2048);
    });

    it("resolves vulnerabilityCount and bundleSizeGzip null on API errors, lookup survives", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async (url: string) => {
                if (url.includes("registry.npmjs.org/flaky-pkg")) {
                    return jsonResponse({ "dist-tags": { latest: "1.0.0" }, time: {} });
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
        vi.stubGlobal(
            "fetch",
            mockFetchByUrl({
                "registry.npmjs.org/homepage-only": {
                    "dist-tags": { latest: "1.0.0" },
                    time: {},
                    homepage: "https://example.com/homepage-only",
                },
                "api.npmjs.org/downloads": { downloads: 0 },
            }),
        );

        const info = await fetchPackageInfo("homepage-only", "1.0.0");

        expect(info.sourceCode).toBe("https://example.com/homepage-only");
    });
});

describe("fetchPackageInfo sourceTree", () => {
    it("prefers npm tarball over known GitHub repository", async () => {
        vi.stubGlobal(
            "fetch",
            mockFetchByUrl({
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
            }),
        );

        const info = await fetchPackageInfo("has-tarball", "1.0.0");

        expect(info.sourceTree).toEqual({
            provider: "npm",
            tarballUrl: "https://registry.npmjs.org/has-tarball/-/has-tarball-1.0.0.tgz",
        });
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
            if (url.includes("git/refs/tags/v1.0.0")) {
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
            if (url.includes("git/refs/tags/2.0.0")) {
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
        vi.stubGlobal(
            "fetch",
            mockFetchByUrl({
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
            }),
        );

        const info = await fetchPackageInfo("no-source", "1.0.0");

        expect(info.sourceTree).toBeNull();
    });

    it("resolves null without tarball or repository", async () => {
        vi.stubGlobal(
            "fetch",
            mockFetchByUrl({
                "registry.npmjs.org/bare-pkg": { "dist-tags": { latest: "1.0.0" }, time: {} },
                "api.npmjs.org/downloads": { downloads: 0 },
            }),
        );

        const info = await fetchPackageInfo("bare-pkg", "1.0.0");

        expect(info.sourceTree).toBeNull();
    });

    it("skips GitHub tag lookup with Source Code Tree column hidden", async () => {
        const fetchMock = mockFetchByUrl({
            "registry.npmjs.org/hidden-column": {
                "dist-tags": { latest: "1.0.0" },
                time: {},
                repository: { type: "git", url: "git+https://github.com/some-org/some-repo.git" },
                versions: { "1.0.0": {} },
            },
            "api.npmjs.org/downloads": { downloads: 0 },
        });
        vi.stubGlobal("fetch", fetchMock);

        const info = await fetchPackageInfo("hidden-column", "1.0.0", {
            visibleColumns: visibleColumnsExcept("sourceCodeTree"),
        });

        expect(info.sourceTree).toBeNull();
        expect(countFetchCalls(fetchMock, "git/refs/tags")).toBe(0);
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
            if (url.includes("git/refs/tags/v1.0.0")) {
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
        expect(countFetchCalls(fetchMock, "git/refs/tags/v1.0.0")).toBe(1);
    });
});

describe("fetchPackageInfo caching", () => {
    it("reuses cached sub-fetches for repeated name+version", async () => {
        const fetchMock = mockFetchByUrl({
            "registry.npmjs.org/cached-pkg": { "dist-tags": { latest: "1.0.0" }, time: {} },
            "api.npmjs.org/downloads": { downloads: 1 },
        });
        vi.stubGlobal("fetch", fetchMock);

        const first = await fetchPackageInfo("cached-pkg", "1.0.0");
        const second = await fetchPackageInfo("cached-pkg", "1.0.0");

        // Not the same object reference - each call composes its own result from
        // (cached) sub-fetches, since which fields get fetched can vary call to
        // call depending on visibleColumns - but no duplicate network request.
        expect(second).toEqual(first);
        expect(countFetchCalls(fetchMock, "registry.npmjs.org/cached-pkg")).toBe(1);
    });

    it("coalesces concurrent same name+version requests into one network round", async () => {
        const fetchMock = mockFetchByUrl({
            "registry.npmjs.org/concurrent-pkg": { "dist-tags": { latest: "1.0.0" }, time: {} },
            "api.npmjs.org/downloads": { downloads: 1 },
        });
        vi.stubGlobal("fetch", fetchMock);

        const [first, second] = await Promise.all([
            fetchPackageInfo("concurrent-pkg", "1.0.0"),
            fetchPackageInfo("concurrent-pkg", "1.0.0"),
        ]);

        expect(second).toEqual(first);
        expect(countFetchCalls(fetchMock, "registry.npmjs.org/concurrent-pkg")).toBe(1);
    });

    it("shares name-scoped lookups across versions of same package", async () => {
        const fetchMock = mockFetchByUrl({
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
        vi.stubGlobal("fetch", fetchMock);

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
                return jsonResponse({ "dist-tags": { latest: "1.0.0" }, time: {}, ...sharedRepo });
            }
            if (url.includes("registry.npmjs.org/pkg-b")) {
                return jsonResponse({ "dist-tags": { latest: "1.0.0" }, time: {}, ...sharedRepo });
            }
            if (url.includes("api.npmjs.org/downloads")) {
                return jsonResponse({ downloads: 1 });
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
        expect(countFetchCalls(fetchMock, "api.github.com/repos/shared-org/shared-repo")).toBe(1);
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
                    return jsonResponse({ "dist-tags": { latest: "1.0.0" }, time: {} });
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

describe("fetchPackageInfo column gating", () => {
    it("skips security-advisory request with Vulnerabilities column hidden", async () => {
        const fetchMock = mockFetchByUrl({
            "registry.npmjs.org/no-vuln-check": { "dist-tags": { latest: "1.0.0" }, time: {} },
            "api.npmjs.org/downloads": { downloads: 1 },
            "api.osv.dev/v1/query": { vulns: [{ id: "GHSA-should-not-be-fetched" }] },
        });
        vi.stubGlobal("fetch", fetchMock);

        const info = await fetchPackageInfo("no-vuln-check", "1.0.0", {
            visibleColumns: visibleColumnsExcept("vulnerabilityCount"),
        });

        expect(info.vulnerabilityCount).toBeNull();
        expect(countFetchCalls(fetchMock, "api.osv.dev")).toBe(0);
    });

    it("skips Bundlephobia request with Bundle size column hidden", async () => {
        const fetchMock = mockFetchByUrl({
            "registry.npmjs.org/no-bundle-check": { "dist-tags": { latest: "1.0.0" }, time: {} },
            "api.npmjs.org/downloads": { downloads: 1 },
            "bundlephobia.com/api/size": { gzip: 4096 },
        });
        vi.stubGlobal("fetch", fetchMock);

        const info = await fetchPackageInfo("no-bundle-check", "1.0.0", {
            visibleColumns: visibleColumnsExcept("bundleSizeGzip"),
        });

        expect(info.bundleSizeGzip).toBeNull();
        expect(countFetchCalls(fetchMock, "bundlephobia.com")).toBe(0);
    });

    it("skips npm downloads request with Weekly downloads column hidden", async () => {
        const fetchMock = mockFetchByUrl({
            "registry.npmjs.org/no-downloads-check": { "dist-tags": { latest: "1.0.0" }, time: {} },
            "api.npmjs.org/downloads": { downloads: 99999 },
        });
        vi.stubGlobal("fetch", fetchMock);

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
        const fetchMock = mockFetchByUrl({
            "registry.npmjs.org/registry-not-needed": {
                "dist-tags": { latest: "1.0.0" },
                time: {},
            },
            "api.npmjs.org/downloads": { downloads: 1 },
        });
        vi.stubGlobal("fetch", fetchMock);

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
                "maintainers",
                "sourceCode",
                "sourceCodeTree",
                "gitStars",
                "openPRs",
                "closedPRs",
                "openIssues",
                "closedIssues",
            ),
        });

        expect(info.sourceCode).toBeNull();
        expect(info.latestVersion).toBeNull();
        expect(countFetchCalls(fetchMock, "registry.npmjs.org/registry-not-needed")).toBe(0);
        // Weekly downloads wasn't hidden, so that call still goes out independently.
        expect(countFetchCalls(fetchMock, "api.npmjs.org/downloads")).toBe(1);
    });

    it("fetches everything without visibleColumns", async () => {
        const fetchMock = mockFetchByUrl({
            "registry.npmjs.org/default-visible": { "dist-tags": { latest: "1.0.0" }, time: {} },
            "api.npmjs.org/downloads": { downloads: 1 },
            "api.osv.dev/v1/query": { vulns: [] },
            "bundlephobia.com/api/size": { gzip: 10 },
        });
        vi.stubGlobal("fetch", fetchMock);

        const info = await fetchPackageInfo("default-visible", "1.0.0");

        expect(info.weeklyDownloads).toBe(1);
        expect(info.vulnerabilityCount).toBe(0);
        expect(info.bundleSizeGzip).toBe(10);
        expect(countFetchCalls(fetchMock, "registry.npmjs.org/default-visible")).toBe(1);
    });
});

describe("fetchPackageJsonForVersion", () => {
    it("returns exact version manifest, including unparsed fields like devDependencies", async () => {
        vi.stubGlobal(
            "fetch",
            mockFetchByUrl({
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
            }),
        );

        const json = await fetchPackageJsonForVersion("drill-pkg", "1.0.0");

        expect(JSON.parse(json!)).toEqual({
            name: "drill-pkg",
            version: "1.0.0",
            dependencies: { a: "^1.0.0" },
            devDependencies: { b: "^1.0.0" },
        });
    });

    it("falls back to latest version for declared version not in registry", async () => {
        vi.stubGlobal(
            "fetch",
            mockFetchByUrl({
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
            }),
        );

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
        const fetchMock = mockFetchByUrl({
            "registry.npmjs.org/shared-drill-pkg": {
                "dist-tags": { latest: "1.0.0" },
                time: {},
                versions: { "1.0.0": { name: "shared-drill-pkg", version: "1.0.0" } },
            },
            "api.npmjs.org/downloads": { downloads: 1 },
        });
        vi.stubGlobal("fetch", fetchMock);

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
                    return jsonResponse({ "dist-tags": { latest: "1.0.0" }, time: {} });
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
        expect(results[0]).toMatchObject({ name: "good" });
        expect(results[1]).toMatchObject({ name: "bad", error: "network down" });
    });
});

describe("fetchPackageInfo failures", () => {
    const HTTP_SERVER_ERROR = 503;
    const HTTP_FORBIDDEN = 403;
    const registryDoc = {
        "dist-tags": { latest: "1.0.0" },
        time: {},
        repository: "git+https://github.com/o/r.git",
        versions: { "1.0.0": {} },
    };

    function failingFetch(
        failPattern: string,
        failure: "status" | "network",
        status = HTTP_SERVER_ERROR,
    ) {
        return vi.fn(async (url: string) => {
            if (url.includes(failPattern)) {
                if (failure === "network") {
                    throw new TypeError("Failed to fetch");
                }
                return { ok: false, status, json: async () => ({}) };
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
        vi.stubGlobal("fetch", failingFetch("search/issues", "status", HTTP_FORBIDDEN));

        const info = await fetchPackageInfo("pkg", "1.0.0");

        expect(info.gitStars).toBe(9);
        expect(info.openPRs).toBeNull();
        expect(info.closedIssues).toBeNull();
    });

    it("rejects on registry server error, retries on next fetch", async () => {
        const fetchMock = failingFetch("registry.npmjs.org", "status");
        vi.stubGlobal("fetch", fetchMock);

        await expect(fetchPackageInfo("pkg", "1.0.0")).rejects.toThrow("503");
        await expect(fetchPackageInfo("pkg", "1.0.0")).rejects.toThrow("503");
        expect(countFetchCalls(fetchMock, "registry.npmjs.org")).toBe(2);
    });
});
