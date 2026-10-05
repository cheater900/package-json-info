import type { SourceTreeRef } from "./api/sourceTree";

export type PackageInput = {
    name: string;
    version: string;
};

export type PackageInfo = {
    name: string;
    version: string;
    versionDate: string | null;
    latestVersion: string | null;
    latestReleaseDate: string | null;
    latestUpdateDate: string | null;
    weeklyDownloads: number | null;
    sourceCode: string | null;
    gitStars: number | null;
    openPRs: number | null;
    closedPRs: number | null;
    openIssues: number | null;
    closedIssues: number | null;
    dependencies: string[] | null;
    license: string | null;
    isOutdated: boolean | null;
    deprecated: string | null;
    vulnerabilityCount: number | null;
    bundleSizeGzip: number | null;
    maintainers: string[] | null;
    /** How to fetch this version's browsable source tree, or null if neither npm nor a supported host has one available. */
    sourceTree: SourceTreeRef | null;
};

export type PackageError = {
    name: string;
    version: string;
    error: string;
};
