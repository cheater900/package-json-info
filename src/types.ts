/** How to fetch a package version's browsable source: npm tarball or GitHub release tag. */
export type SourceTreeRef =
    | { provider: "npm"; tarballUrl: string }
    | { provider: "github"; owner: string; repo: string; tag: string };

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
    /** 0-100, higher = healthier; null when no signal was available. */
    healthScore: number | null;
    /** Keys of the signals healthScore was computed from. */
    healthSignals: string[] | null;
    deprecated: string | null;
    vulnerabilityCount: number | null;
    bundleSizeGzip: number | null;
    maintainers: string[] | null;
    /** How to fetch this version's browsable source tree, or null if neither npm nor a supported host has one available. */
    sourceTree: SourceTreeRef | null;
};

export type SortDirection = "asc" | "desc";

export type PackageError = {
    name: string;
    version: string;
    error: string;
};

/** One table row: fetched metadata, or the error that stopped the fetch. */
export type DependencyRow = PackageInfo | PackageError;
