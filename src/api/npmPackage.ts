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
import { resolveRegistrySpec } from "../utils/npmSpec";
import { isHttpUrl } from "../utils/url";
import { normaliseRepoUrl, parseRepoSlug, repoSlugKey, repoWebUrl } from "../utils/repoUrl";
import type { RepoSlug } from "../utils/repoUrl";
import { fetchJson } from "./http";
import type { HttpHeaders } from "./http";
import { findGithubReleaseTag, githubHeaders } from "./github";
import { EMPTY_ISSUE_COUNTS, fetchRepoIssueCounts, fetchRepoStars } from "./repoMetadata";
import type { RepoIssueCounts } from "./repoMetadata";
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
    next_page_token?: string;
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

/** Columns backed by the PR/issue-count search against the repo host. */
const ISSUE_COUNT_COLUMNS = ["openPRs", "closedPRs", "openIssues", "closedIssues"];

// Caches hold promises keyed by each lookup's natural key (package name,
// name@version, or repo slug), so concurrent callers share one in-flight
// request and packages sharing a name or monorepo share results. No
// whole-PackageInfo cache: which sub-fetches run depends on visible columns.
// Caches live for the page load. Failed lookups reject and are evicted
// (see memoizeAsync), so a rate limit or outage is retried on the next
// fetch instead of being cached as "no data". The GitHub token of the first caller for
// a slug wins; the app uses one token, so this never differs.
const registryDataCache = new Map<string, Promise<NpmRegistryData | null>>();
const weeklyDownloadsCache = new Map<string, Promise<number | null>>();
const vulnerabilityCountCache = new Map<string, Promise<number | null>>();
const bundleSizeCache = new Map<string, Promise<number | null>>();
const repoStarsCache = new Map<string, Promise<number | null>>();
const repoIssueCountsCache = new Map<string, Promise<RepoIssueCounts>>();
const githubReleaseTagCache = new Map<string, Promise<string | null>>();

/** Clears every in-memory metadata cache. Exposed for tests. */
export function clearPackageInfoCache(): void {
    registryDataCache.clear();
    weeklyDownloadsCache.clear();
    vulnerabilityCountCache.clear();
    bundleSizeCache.clear();
    repoStarsCache.clear();
    repoIssueCountsCache.clear();
    githubReleaseTagCache.clear();
}

/** Optional per-field lookups fall back to `fallback` so one failing service can't fail the row. */
function withFallback<T>(request: Promise<T>, fallback: T): Promise<T> {
    return request.catch(() => fallback);
}

function anyColumnVisible(visibleColumns: ReadonlySet<string>, keys: string[]): boolean {
    return keys.some((key) => isColumnVisible(visibleColumns, key));
}

/** Leading `major.minor.patch` of a range ("^1.2.3" -> "1.2.3"), or undefined. */
function pinnedVersionOf(range: string): string | undefined {
    return parseLeadingSemver(range)?.join(".");
}

/**
 * Registry key `range` refers to: itself when published, else its leading
 * semver ("^1.2.3" -> "1.2.3") when published, else the latest version.
 */
function resolveVersionKey(npmData: NpmRegistryData | null, range: string): string | undefined {
    const versions = npmData?.versions ?? {};
    return [range, pinnedVersionOf(range), npmData?.["dist-tags"]?.latest].find(
        (key) => key != null && Object.hasOwn(versions, key),
    );
}

function resolveVersionData(
    npmData: NpmRegistryData | null,
    range: string,
): NpmVersionData | undefined {
    const key = resolveVersionKey(npmData, range);
    return key ? npmData?.versions?.[key] : undefined;
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
    const { registryName, range } = resolveRegistrySpec(name, version);
    const headers = githubHeaders(githubToken);
    const isVisible = (key: string) => isColumnVisible(visibleColumns, key);
    const [npmData, weeklyDownloads, vulnerabilityCount, bundleSizeGzip] = await Promise.all([
        anyColumnVisible(visibleColumns, REGISTRY_DATA_COLUMNS)
            ? fetchRegistryData(registryName)
            : null,
        isVisible("weeklyDownloads")
            ? withFallback(fetchWeeklyDownloads(registryName), null)
            : null,
        isVisible("vulnerabilityCount")
            ? withFallback(fetchVulnerabilityCount(registryName), null)
            : null,
        isVisible("bundleSizeGzip")
            ? withFallback(fetchBundleGzipSize(registryName, range), null)
            : null,
    ]);
    const times = npmData?.time ?? {};
    const latestVersion = npmData?.["dist-tags"]?.latest ?? null;
    const versionData = resolveVersionData(npmData, range);
    const slug = parseRepoSlug(repositoryUrl(npmData) ?? "");
    const [gitStars, issueCounts, sourceTree] = await Promise.all([
        slug != null && isVisible("gitStars")
            ? withFallback(fetchCachedRepoStars(slug, headers), null)
            : null,
        slug != null && anyColumnVisible(visibleColumns, ISSUE_COUNT_COLUMNS)
            ? withFallback(fetchCachedIssueCounts(slug, headers), EMPTY_ISSUE_COUNTS)
            : EMPTY_ISSUE_COUNTS,
        isVisible("sourceCodeTree")
            ? withFallback(resolveSourceTree(versionData, slug, range, headers), null)
            : null,
    ]);
    const sourceCode =
        slug != null
            ? repoWebUrl(slug)
            : (normaliseRepoUrl(repositoryUrl(npmData)) ?? npmData?.homepage);
    return {
        name,
        version,
        versionDate: times[range] ?? times[pinnedVersionOf(range) ?? ""] ?? null,
        latestVersion,
        latestReleaseDate: latestVersion ? (times[latestVersion] ?? null) : null,
        latestUpdateDate: times.modified ?? null,
        weeklyDownloads,
        sourceCode: isHttpUrl(sourceCode) ? sourceCode : null,
        gitStars,
        ...issueCounts,
        dependencies: versionData?.dependencies ? Object.keys(versionData.dependencies) : null,
        license: extractLicense(versionData?.license) ?? extractLicense(npmData?.license),
        isOutdated: isVersionOutdated(range, latestVersion),
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
    const { registryName, range } = resolveRegistrySpec(name, version);
    const versionData = resolveVersionData(await fetchRegistryData(registryName), range);
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
 * Known security advisories via OSV, following `next_page_token` across
 * result pages. Throws on failure; OSV may block browser requests (CORS,
 * rate limits).
 */
function fetchVulnerabilityCount(name: string): Promise<number | null> {
    return memoizeAsync(vulnerabilityCountCache, name, async () => {
        let count = 0;
        let pageToken: string | undefined;
        do {
            const data = await fetchJson<OsvQueryResponse>(OSV_QUERY_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    package: { name, ecosystem: OSV_NPM_ECOSYSTEM },
                    page_token: pageToken,
                }),
            });
            if (!data) {
                return null;
            }
            count += data.vulns?.length ?? 0;
            // A repeated token would loop forever; treat it as the last page.
            pageToken = data.next_page_token === pageToken ? undefined : data.next_page_token;
        } while (pageToken);
        return count;
    });
}

/** Min+gzip size via Bundlephobia. Version-scoped, since size differs across versions. Throws on failure. */
function fetchBundleGzipSize(name: string, range: string): Promise<number | null> {
    const pinnedVersion = pinnedVersionOf(range);
    const packageSpec = pinnedVersion ? `${name}@${pinnedVersion}` : name;
    return memoizeAsync(bundleSizeCache, packageSpec, () =>
        fetchJson<BundlephobiaData>(
            `${BUNDLEPHOBIA_SIZE_URL}?package=${encodeURIComponent(packageSpec)}`,
        ).then((data) => data?.gzip ?? null),
    );
}

function fetchCachedRepoStars(slug: RepoSlug, headers: HttpHeaders): Promise<number | null> {
    return memoizeAsync(repoStarsCache, repoSlugKey(slug), () => fetchRepoStars(slug, headers));
}

function fetchCachedIssueCounts(slug: RepoSlug, headers: HttpHeaders): Promise<RepoIssueCounts> {
    return memoizeAsync(repoIssueCountsCache, repoSlugKey(slug), () =>
        fetchRepoIssueCounts(slug, headers),
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
    range: string,
    headers: HttpHeaders,
): Promise<SourceTreeRef | null> {
    const tarballUrl = versionData?.dist?.tarball;
    if (tarballUrl) {
        return { provider: "npm", tarballUrl };
    }
    const pinnedVersion = pinnedVersionOf(range);
    if (slug?.host !== GITHUB_HOST || !pinnedVersion) {
        return null;
    }
    const tag = await memoizeAsync(
        githubReleaseTagCache,
        `${repoSlugKey(slug)}@${pinnedVersion}`,
        () => findGithubReleaseTag(slug.owner, slug.repo, pinnedVersion, headers),
    );
    if (!tag) {
        return null;
    }
    return { provider: "github", owner: slug.owner, repo: slug.repo, tag };
}
