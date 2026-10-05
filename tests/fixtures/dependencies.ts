export const npmSourceTree = {
    provider: "npm",
    tarballUrl: "https://registry.npmjs.org/left-pad/-/left-pad-1.2.0.tgz",
};

/** A dependency row with every field populated, except its source tree. */
export const fullDependency = {
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
    dependencies: ["a", "b"],
    license: "MIT",
    isOutdated: true,
    deprecated: null,
    vulnerabilityCount: 0,
    bundleSizeGzip: 15360,
    maintainers: ["alice", "bob"],
    sourceTree: null,
};

/** A dependency row where every fetched field is unavailable. */
export const sparseDependency = {
    name: "no-data-pkg",
    version: "0.0.1",
    versionDate: null,
    latestVersion: null,
    latestReleaseDate: null,
    latestUpdateDate: null,
    weeklyDownloads: null,
    sourceCode: null,
    gitStars: null,
    openPRs: null,
    closedPRs: null,
    openIssues: null,
    closedIssues: null,
    dependencies: null,
    license: null,
    isOutdated: null,
    deprecated: null,
    vulnerabilityCount: null,
    bundleSizeGzip: null,
    maintainers: null,
    sourceTree: null,
};
