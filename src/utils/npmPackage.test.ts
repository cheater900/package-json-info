import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchPackageInfo, fetchPackagesInfo } from "./npmPackage";

function jsonResponse(body: unknown, ok = true) {
  return {
    ok,
    status: ok ? 200 : 404,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function mockFetchByUrl(handlers: Record<string, unknown>) {
  return vi.fn(async (url: string) => {
    for (const [pattern, body] of Object.entries(handlers)) {
      if (url.includes(pattern)) {
        return jsonResponse(body);
      }
    }
    return jsonResponse(null, false);
  });
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchPackageInfo", () => {
  it("resolves npm registry, downloads, and GitHub data for a package with a GitHub repository", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchByUrl({
        "registry.npmjs.org/left-pad": {
          "dist-tags": { latest: "1.3.0" },
          time: { "1.2.0": "2020-01-01T00:00:00.000Z", "1.3.0": "2021-01-01T00:00:00.000Z", modified: "2021-06-01T00:00:00.000Z" },
          repository: { type: "git", url: "git+https://github.com/left-pad/left-pad.git" },
          versions: {
            "1.2.0": { dependencies: { "tiny-dep": "^1.0.0" } },
          },
        },
        "api.npmjs.org/downloads": { downloads: 4242 },
        "api.github.com/repos/left-pad/left-pad": { stargazers_count: 99 },
        "is:pr+is:open": { total_count: 2 },
        "is:pr+is:closed": { total_count: 10 },
        "is:issue+is:open": { total_count: 3 },
        "is:issue+is:closed": { total_count: 20 },
      })
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
    });
  });

  it("falls back to the latest version's dependencies when the installed version isn't in the registry response", async () => {
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
      })
    );

    const info = await fetchPackageInfo("foo", "^1.0.0");

    expect(info.dependencies).toEqual(["bar"]);
  });

  it("leaves GitHub-derived fields null when there's no repository to resolve", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchByUrl({
        "registry.npmjs.org/no-repo": {
          "dist-tags": { latest: "1.0.0" },
          time: {},
        },
        "api.npmjs.org/downloads": { downloads: 5 },
      })
    );

    const info = await fetchPackageInfo("no-repo", "1.0.0");

    expect(info.sourceCode).toBeNull();
    expect(info.gitStars).toBeNull();
    expect(info.openPRs).toBeNull();
    expect(info.closedPRs).toBeNull();
    expect(info.openIssues).toBeNull();
    expect(info.closedIssues).toBeNull();
    expect(info.dependencies).toBeNull();
  });

  it("resolves stars from GitLab for a package with a GitLab repository, and leaves PR/issue counts null", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchByUrl({
        "registry.npmjs.org/gl-pkg": {
          "dist-tags": { latest: "1.0.0" },
          time: {},
          repository: { type: "git", url: "git+https://gitlab.com/some-group/gl-pkg.git" },
        },
        "api.npmjs.org/downloads": { downloads: 7 },
        "gitlab.com/api/v4/projects/some-group%2Fgl-pkg": { star_count: 55 },
      })
    );

    const info = await fetchPackageInfo("gl-pkg", "1.0.0");

    expect(info.sourceCode).toBe("https://gitlab.com/some-group/gl-pkg");
    expect(info.gitStars).toBe(55);
    expect(info.openPRs).toBeNull();
    expect(info.closedPRs).toBeNull();
    expect(info.openIssues).toBeNull();
    expect(info.closedIssues).toBeNull();
  });

  it("resolves stars from Codeberg for a package with a Codeberg repository", async () => {
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
      })
    );

    const info = await fetchPackageInfo("cb-pkg", "1.0.0");

    expect(info.sourceCode).toBe("https://codeberg.org/some-org/cb-pkg");
    expect(info.gitStars).toBe(12);
  });

  it("falls back to the npm homepage when there's no GitHub repository", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchByUrl({
        "registry.npmjs.org/homepage-only": {
          "dist-tags": { latest: "1.0.0" },
          time: {},
          homepage: "https://example.com/homepage-only",
        },
        "api.npmjs.org/downloads": { downloads: 0 },
      })
    );

    const info = await fetchPackageInfo("homepage-only", "1.0.0");

    expect(info.sourceCode).toBe("https://example.com/homepage-only");
  });
});

describe("fetchPackagesInfo", () => {
  it("resolves every package and reports failures individually instead of rejecting the whole batch", async () => {
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
      })
    );

    const results = await fetchPackagesInfo([
      { name: "good", version: "1.0.0" },
      { name: "bad", version: "1.0.0" },
    ]);

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ name: "good" });
    expect(results[1]).toMatchObject({ name: "bad", error: "network down" });
  });

  it("calls onProgress once per package as each one resolves", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchByUrl({
        "registry.npmjs.org": { "dist-tags": { latest: "1.0.0" }, time: {} },
        "api.npmjs.org/downloads": { downloads: 1 },
      })
    );

    const onProgress = vi.fn();
    await fetchPackagesInfo(
      [
        { name: "a", version: "1.0.0" },
        { name: "b", version: "1.0.0" },
      ],
      { onProgress }
    );

    expect(onProgress).toHaveBeenCalledTimes(2);
  });
});
