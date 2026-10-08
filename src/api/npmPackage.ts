import type { PackageInfo, PackageInput, PackageError } from "../types";
import { config } from "../config";
import {
    BUNDLEPHOBIA_SIZE_URL,
    GITHUB_HOST,
    NPM_REGISTRY_URL,
    NPM_WEEKLY_DOWNLOADS_URL,
    OSV_NPM_ECOSYSTEM,
    OSV_QUERY_URL,
} from "../constants";
import { isVersionOutdated, parseLeadingSemver } from "../utils/semver";
import { isColumnVisible, TOGGLEABLE_COLUMNS } from "../utils/tableColumns";
import { extractLicense } from "../utils/license";
import type { NpmLicenseField } from "../utils/license";
import { memoizeAsync } from "../utils/memoizeAsync";
import { normaliseRepoUrl, parseRepoSlug, repoSlugKey, repoWebUrl } from "../utils/repoUrl";
import type { RepoSlug } from "../utils/repoUrl";
import { fetchJson, fetchWithTimeout } from "./http";
import type { HttpHeaders } from "./http";
import { findGithubReleaseTag, githubHeaders } from "./github";
import { EMPTY_REPO_METADATA, fetchRepoMetadata } from "./repoMetadata";
import type { RepoMetadata } from "./repoMetadata";
import type { SourceTreeRef } from "./sourceTree";

export type FetchPackageOptions = {
    githubToken?: string;
    /**
     * Columns currently visible in the UI. Network calls backing only
     * hidden columns are skipped. Omit to fetch everything.
     */
    visibleColumns?: ReadonlySet<string>;
};

export type FetchPackagesOptions = FetchPackageOptions & {
    /** Maximum number of packages fetched in parallel. */
    concurrency?: number;
};

type NpmVersionData = {
    dependencies?: Record<string, string>;
    license?: NpmLicenseField;
    deprecated?: string;
    dist?: { tarball?: string };
};

type NpmRegistryData = {
    "dist-tags"?: Record<string, string>;
    time?: Record<string, string>;
    repository?: { type?: string; url?: string } | string;
    homepage?: string;
    versions?: Record<string, NpmVersionData>;
    license?: NpmLicenseField;
    maintainers?: Array<{ name?: string }>;
};

type NpmDownloadsData = {
    downloads?: number;
};

type OsvQueryResponse = {
    vulns?: Array<{ id: string }>;
};

type BundlephobiaData = {
    gzip?: number;
};

const ALL_TOGGLEABLE_COLUMN_KEYS = new Set(TOGGLEABLE_COLUMNS.map((c) => c.key));

/** Columns derived from the npm registry document, directly or via its repo slug. */
const REGISTRY_DATA_COLUMNS = [
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
];

/** Columns backed by the stars/PR/issue-count lookup against the repo host. */
const REPO_METADATA_COLUMNS = ["gitStars", "openPRs", "closedPRs", "openIssues", "closedIssues"];

// Caches hold promises keyed by each lookup's natural key (package name,
// name@version, or repo slug), so concurrent callers share one in-flight
// request and packages sharing a name or monorepo share results. No
// whole-PackageInfo cache: which sub-fetches run depends on visible columns.
// Caches live for the page load. The GitHub token of the first caller for
// a slug wins; the app uses one token, so this never differs.
const registryDataCache = new Map<string, Promise<NpmRegistryData | null>>();
const weeklyDownloadsCache = new Map<string, Promise<number | null>>();
const vulnerabilityCountCache = new Map<string, Promise<number | null>>();
const bundleSizeCache = new Map<string, Promise<number | null>>();
const repoMetadataCache = new Map<string, Promise<RepoMetadata>>();
const githubReleaseTagCache = new Map<string, Promise<string | null>>();

/** Clears every in-memory metadata cache. Exposed for tests. */
export function clearPackageInfoCache(): void {
    registryDataCache.clear();
    weeklyDownloadsCache.clear();
    vulnerabilityCountCache.clear();
    bundleSizeCache.clear();
    repoMetadataCache.clear();
    githubReleaseTagCache.clear();
}

/** Optional per-field lookups fall back to `fallback` so one failing service can't fail the row. */
function withFallback<T>(request: Promise<T>, fallback: T): Promise<T> {
    return request.catch(() => fallback);
}

function anyColumnVisible(visibleColumns: ReadonlySet<string>, keys: string[]): boolean {
    return keys.some((key) => isColumnVisible(visibleColumns, key));
}

/** Data for `version`, or for the latest version when `version` is a range rather than a registry key. */
function resolveVersionData(
    npmData: NpmRegistryData | null,
    version: string,
): NpmVersionData | undefined {
    const latestVersion = npmData?.["dist-tags"]?.latest;
    return (
        npmData?.versions?.[version] ??
        (latestVersion ? npmData?.versions?.[latestVersion] : undefined)
    );
}

function repositoryUrl(npmData: NpmRegistryData | null): string | undefined {
    const repository = npmData?.repository;
    return typeof repository === "string" ? repository : repository?.url;
}

function maintainerNames(npmData: NpmRegistryData | null): string[] | null {
    const names = npmData?.maintainers?.map((m) => m.name).filter((n): n is string => Boolean(n));
    return names && names.length > 0 ? names : null;
}

/**
 * Fetches enriched metadata for one npm package, skipping network calls
 * that back only hidden columns and reusing cached sub-fetches.
 *
 * @param version - The declared version or range (e.g. "^4.17.21")
 */
export async function fetchPackageInfo(
    name: string,
    version: string,
    options: FetchPackageOptions = {},
): Promise<PackageInfo> {
    const { githubToken, visibleColumns = ALL_TOGGLEABLE_COLUMN_KEYS } = options;
    const headers = githubHeaders(githubToken);
    const isVisible = (key: string) => isColumnVisible(visibleColumns, key);
    const [npmData, weeklyDownloads, vulnerabilityCount, bundleSizeGzip] = await Promise.all([
        anyColumnVisible(visibleColumns, REGISTRY_DATA_COLUMNS) ? fetchRegistryData(name) : null,
        isVisible("weeklyDownloads") ? withFallback(fetchWeeklyDownloads(name), null) : null,
        isVisible("vulnerabilityCount") ? withFallback(fetchVulnerabilityCount(name), null) : null,
        isVisible("bundleSizeGzip") ? withFallback(fetchBundleGzipSize(name, version), null) : null,
    ]);
    const times = npmData?.time ?? {};
    const latestVersion = npmData?.["dist-tags"]?.latest ?? null;
    const versionData = resolveVersionData(npmData, version);
    const slug = parseRepoSlug(repositoryUrl(npmData) ?? "");
    const [repoMetadata, sourceTree] = await Promise.all([
        slug != null && anyColumnVisible(visibleColumns, REPO_METADATA_COLUMNS)
            ? withFallback(fetchCachedRepoMetadata(slug, headers), EMPTY_REPO_METADATA)
            : EMPTY_REPO_METADATA,
        isVisible("sourceCodeTree")
            ? withFallback(resolveSourceTree(versionData, slug, version, headers), null)
            : null,
    ]);
    return {
        name,
        version,
        versionDate: times[version] ?? null,
        latestVersion,
        latestReleaseDate: latestVersion ? (times[latestVersion] ?? null) : null,
        latestUpdateDate: times.modified ?? null,
        weeklyDownloads,
        sourceCode:
            slug != null
                ? repoWebUrl(slug)
                : (normaliseRepoUrl(repositoryUrl(npmData)) ?? npmData?.homepage ?? null),
        gitStars: repoMetadata.stars,
        openPRs: repoMetadata.openPRs,
        closedPRs: repoMetadata.closedPRs,
        openIssues: repoMetadata.openIssues,
        closedIssues: repoMetadata.closedIssues,
        dependencies: versionData?.dependencies ? Object.keys(versionData.dependencies) : null,
        license: extractLicense(versionData?.license) ?? extractLicense(npmData?.license),
        isOutdated: isVersionOutdated(version, latestVersion),
        deprecated: versionData?.deprecated ?? null,
        vulnerabilityCount,
        bundleSizeGzip,
        maintainers: maintainerNames(npmData),
        sourceTree,
    };
}

/**
 * Fetches a package version's manifest (npm's per-version registry data,
 * essentially its package.json) as JSON text, for the drill-down action.
 * Shares the registry cache with fetchPackageInfo.
 *
 * @returns The package.json text, or null if the package/version is unknown.
 */
export async function fetchPackageJsonForVersion(
    name: string,
    version: string,
): Promise<string | null> {
    const versionData = resolveVersionData(await fetchRegistryData(name), version);
    if (!versionData) {
        return null;
    }
    return JSON.stringify(versionData, null, 2);
}

/**
 * Fetches enriched metadata for multiple packages, at most `concurrency`
 * at a time. A failing package yields a PackageError instead of rejecting.
 */
export async function fetchPackagesInfo(
    packages: PackageInput[],
    options: FetchPackagesOptions = {},
): Promise<Array<PackageInfo | PackageError>> {
    const { concurrency = config.fetchConcurrency, ...fetchOptions } = options;
    const results = Array.from<PackageInfo | PackageError>({ length: packages.length });
    let nextIndex = 0;

    async function worker(): Promise<void> {
        while (nextIndex < packages.length) {
            const i = nextIndex++;
            const { name, version } = packages[i];
            try {
                results[i] = await fetchPackageInfo(name, version, fetchOptions);
            } catch (err) {
                results[i] = { name, version, error: err.message };
            }
        }
    }

    await Promise.all(Array.from({ length: Math.min(concurrency, packages.length) }, worker));
    return results;
}

function fetchRegistryData(name: string): Promise<NpmRegistryData | null> {
    return memoizeAsync(registryDataCache, name, () =>
        fetchJson<NpmRegistryData>(`${NPM_REGISTRY_URL}/${encodeURIComponent(name)}`),
    );
}

function fetchWeeklyDownloads(name: string): Promise<number | null> {
    return memoizeAsync(weeklyDownloadsCache, name, () =>
        fetchJson<NpmDownloadsData>(`${NPM_WEEKLY_DOWNLOADS_URL}/${encodeURIComponent(name)}`).then(
            (d) => d?.downloads ?? null,
        ),
    );
}

/**
 * Known security advisories via OSV. Best-effort: OSV may be unreachable
 * from a browser (rate limits, CORS), so failure resolves to null.
 */
function fetchVulnerabilityCount(name: string): Promise<number | null> {
    return memoizeAsync(vulnerabilityCountCache, name, async () => {
        try {
            const response = await fetchWithTimeout(OSV_QUERY_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ package: { name, ecosystem: OSV_NPM_ECOSYSTEM } }),
            });
            if (!response.ok) {
                return null;
            }
            const data = (await response.json()) as OsvQueryResponse;
            return data.vulns?.length ?? 0;
        } catch {
            return null;
        }
    });
}

/**
 * Min+gzip size via Bundlephobia. Best-effort like fetchVulnerabilityCount.
 * Version-scoped, since size differs across versions.
 */
function fetchBundleGzipSize(name: string, version: string): Promise<number | null> {
    const pinnedVersion = parseLeadingSemver(version)?.join(".");
    const packageSpec = pinnedVersion ? `${name}@${pinnedVersion}` : name;
    return memoizeAsync(bundleSizeCache, `${name}@${version}`, () =>
        fetchJson<BundlephobiaData>(
            `${BUNDLEPHOBIA_SIZE_URL}?package=${encodeURIComponent(packageSpec)}`,
        )
            .then((data) => data?.gzip ?? null)
            .catch(() => null),
    );
}

function fetchCachedRepoMetadata(slug: RepoSlug, headers: HttpHeaders): Promise<RepoMetadata> {
    return memoizeAsync(repoMetadataCache, repoSlugKey(slug), () =>
        fetchRepoMetadata(slug, headers),
    );
}

/**
 * How this version's source can be browsed: npm's tarball when listed
 * (nearly always), else a matching GitHub release tag. Other hosts get no
 * fallback; their tree/tag APIs differ and npm rarely lacks a tarball.
 */
async function resolveSourceTree(
    versionData: NpmVersionData | undefined,
    slug: RepoSlug | null,
    version: string,
    headers: HttpHeaders,
): Promise<SourceTreeRef | null> {
    const tarballUrl = versionData?.dist?.tarball;
    if (tarballUrl) {
        return { provider: "npm", tarballUrl };
    }
    if (slug?.host !== GITHUB_HOST) {
        return null;
    }
    const tag = await memoizeAsync(githubReleaseTagCache, `${repoSlugKey(slug)}@${version}`, () =>
        findGithubReleaseTag(slug.owner, slug.repo, version, headers),
    );
    if (!tag) {
        return null;
    }
    return { provider: "github", owner: slug.owner, repo: slug.repo, tag };
}
