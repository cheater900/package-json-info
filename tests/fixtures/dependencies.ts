import type { SourceTreeRef } from "../../src/core/types";

/** Smallest npm registry document: one published version, no metadata. */
export const minimalRegistryDoc = { "dist-tags": { latest: "1.0.0" }, time: {} };

export const npmSourceTree: SourceTreeRef = {
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
    lastCommitDate: null,
    commitsLastYear: null,
    openPRs: 2,
    closedPRs: 10,
    openIssues: 3,
    closedIssues: 20,
    dependencies: ["a", "b"],
    license: "MIT",
    isOutdated: true,
    healthScore: 55,
    healthSignals: ["releaseAge", "deprecated", "outdated"],
    deprecated: null,
    vulnerabilityCount: 0,
    bundleSizeGzip: 15360,
    maintainers: ["alice", "bob"],
    sourceTree: null,
    staleSince: null,
    failedLookups: null,
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
    lastCommitDate: null,
    commitsLastYear: null,
    openPRs: null,
    closedPRs: null,
    openIssues: null,
    closedIssues: null,
    dependencies: null,
    license: null,
    isOutdated: null,
    healthScore: null,
    healthSignals: null,
    deprecated: null,
    vulnerabilityCount: null,
    bundleSizeGzip: null,
    maintainers: null,
    sourceTree: null,
    staleSince: null,
    failedLookups: null,
};
