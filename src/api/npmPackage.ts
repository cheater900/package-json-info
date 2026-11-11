import { z } from "zod";
import type { DependencyRow, PackageInfo, PackageInput, SourceTreeRef } from "../types";
import {
    BUNDLEPHOBIA_SIZE_URL,
    GITHUB_HOST,
    JSON_INDENT,
    NPM_REGISTRY_URL,
    NPM_WEEKLY_DOWNLOADS_URL,
    OSV_MAX_PAGES,
    OSV_NPM_ECOSYSTEM,
    OSV_QUERY_URL,
} from "../constants";
import { isVersionOutdated, pinnedVersionOf } from "../utils/semver";
import { isColumnVisible, TOGGLEABLE_COLUMNS } from "../utils/tableColumns";
import { extractLicense, NpmLicenseSchema } from "../utils/license";
import { loadLookup, saveLookup } from "../utils/lookupStore";
import type { LookupKind } from "../utils/lookupStore";
import { memoizeAsync } from "../utils/memoizeAsync";
import { resolveRegistrySpec } from "../utils/npmSpec";
import { settle } from "../utils/settle";
import { isHttpUrl } from "../utils/url";
import { normaliseRepoUrl, parseRepoSlug, repoSlugKey, repoWebUrl } from "../utils/repoUrl";
import type { RepoSlug } from "../utils/repoUrl";
import { settings } from "../settings";
import { fetchJson } from "./http";
import type { HttpHeaders } from "./http";
import { findGithubReleaseTag, githubHeaders } from "./github";
import { EMPTY_ISSUE_COUNTS, fetchRepoIssueCounts, fetchRepoStars } from "./repoMetadata";
import type { RepoIssueCounts } from "./repoMetadata";

/**
 * Registry documents hold whatever each package published. A field of the
 * wrong type reads as missing, so one bad value can't fail the whole row.
 */
function lenient<T extends z.ZodType>(schema: T) {
    return schema.optional().catch(undefined);
}

const NpmVersionSchema = z
    .object({
        dependencies: lenient(z.record(z.string(), z.unknown())),
        license: lenient(NpmLicenseSchema),
        deprecated: lenient(z.string()),
        dist: lenient(z.object({ tarball: lenient(z.string()) })),
    })
    .catch({});

/** `versions` values stay raw: the drill-down shows a version's whole manifest. */
const NpmRegistrySchema = z
    .object({
        "dist-tags": lenient(z.object({ latest: lenient(z.string()) })),
        time: lenient(z.record(z.string(), lenient(z.string()))),
        repository: lenient(z.union([z.string(), z.object({ url: lenient(z.string()) })])),
        homepage: lenient(z.string()),
        versions: lenient(z.record(z.string(), z.unknown())),
        license: lenient(NpmLicenseSchema),
        maintainers: lenient(z.array(z.object({ name: lenient(z.string()) }).catch({}))),
    })
    .catch({});

export type FetchPackageOptions = {
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

/** One lookup's answer. `staleSince` is the save time of a stored value used after the live fetch failed, else null. */
type Lookup<T> = {
    value: T;
    staleSince: string | null;
};

const COLUMNS_ALL_TOGGLEABLE = new Set(TOGGLEABLE_COLUMNS.map((c) => c.key));

/** Columns derived from the npm registry document, directly or via its repo slug. */
const COLUMNS_FROM_REGISTRY = [
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
const COLUMNS_FROM_ISSUE_SEARCH = ["openPRs", "closedPRs", "openIssues", "closedIssues"];

// Caches hold promises keyed by each lookup's natural key (package name,
// name@version, or repo slug), so concurrent callers share one in-flight
// request and packages sharing a name or monorepo share results. No
// whole-PackageInfo cache: which sub-fetches run depends on visible columns.
// Caches live for the page load. Failed lookups reject and are evicted
// (see memoizeAsync), so a rate limit or outage is retried on the next
// fetch instead of being cached as "no data". A failed lookup answered from
// the offline store is evicted too (see memoizeLookup).
const registryDataCache = new Map<string, Promise<Lookup<NpmRegistryData | null>>>();
const weeklyDownloadsCache = new Map<string, Promise<Lookup<number | null>>>();
const vulnerabilityCountCache = new Map<string, Promise<Lookup<number | null>>>();
const bundleSizeCache = new Map<string, Promise<Lookup<number | null>>>();
const repoStarsCache = new Map<string, Promise<Lookup<number | null>>>();
const repoIssueCountsCache = new Map<string, Promise<Lookup<RepoIssueCounts>>>();
const githubReleaseTagCache = new Map<string, Promise<Lookup<string | null>>>();

/** Clears every in-memory metadata cache, e.g. after the proxy changes. */
export function clearPackageInfoCache(): void {
    registryDataCache.clear();
    weeklyDownloadsCache.clear();
    vulnerabilityCountCache.clear();
    bundleSizeCache.clear();
    repoStarsCache.clear();
    repoIssueCountsCache.clear();
    githubReleaseTagCache.clear();
}

function fresh<T>(value: T): Lookup<T> {
    return { value, staleSince: null };
}

/** Oldest save time among stale lookups; null when all were live. ISO timestamps sort as text. */
function oldestStaleSince(lookups: Lookup<unknown>[]): string | null {
    return (
        lookups
            .map((lookup) => lookup.staleSince)
            .filter((staleSince) => staleSince != null)
            .sort()[0] ?? null
    );
}

/**
 * memoizeAsync backed by the offline store. A live answer (`null` included:
 * 404 means "no data") is saved and returned fresh. When the live fetch
 * fails, the last saved answer is returned as stale and evicted from
 * `cache`, so the next fetch retries live; callers already waiting share
 * it. Without a saved answer the live error is thrown unchanged.
 */
function memoizeLookup<T>(
    cache: Map<string, Promise<Lookup<T>>>,
    kind: LookupKind,
    key: string,
    fetchLive: () => Promise<T>,
): Promise<Lookup<T>> {
    const request: Promise<Lookup<T>> = memoizeAsync(cache, key, async () => {
        let value: T;
        try {
            value = await fetchLive();
        } catch (error) {
            const stored = await loadLookup<T>(kind, key);
            if (!stored) {
                throw error;
            }
            const isStillCached = cache.get(key) === request;
            if (isStillCached) {
                cache.delete(key);
            }
            return { value: stored.value, staleSince: stored.savedAt };
        }
        // Not awaited: a slow or hanging IndexedDB must not delay the row.
        void saveLookup(kind, key, value);
        return fresh(value);
    });
    return request;
}

/** Optional per-field lookups fall back to `fallback` so one failing service can't fail the row. */
function withFallback<T>(request: Promise<T>, fallback: T): Promise<T> {
    return request.catch(() => fallback);
}

function anyColumnVisible(visibleColumns: ReadonlySet<string>, keys: string[]): boolean {
    return keys.some((key) => isColumnVisible(visibleColumns, key));
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

/** Raw manifest of the version `range` refers to; undefined when unpublished. */
function resolveVersionData(npmData: NpmRegistryData | null, range: string): unknown {
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
    const { visibleColumns = COLUMNS_ALL_TOGGLEABLE } = options;
    const { registryName, range } = resolveRegistrySpec(name, version);
    const headers = githubHeaders();
    const isVisible = (key: string) => isColumnVisible(visibleColumns, key);
    const noData = fresh(null);
    const [registry, weeklyDownloads, vulnerabilityCount, bundleSizeGzip] = await Promise.all([
        anyColumnVisible(visibleColumns, COLUMNS_FROM_REGISTRY)
            ? fetchRegistryData(registryName)
            : noData,
        isVisible("weeklyDownloads")
            ? withFallback(fetchWeeklyDownloads(registryName), noData)
            : noData,
        isVisible("vulnerabilityCount")
            ? withFallback(fetchVulnerabilityCount(registryName), noData)
            : noData,
        isVisible("bundleSizeGzip")
            ? withFallback(fetchBundleGzipSize(registryName, range), noData)
            : noData,
    ]);
    const npmData = registry.value;
    const times = npmData?.time ?? {};
    const latestVersion = npmData?.["dist-tags"]?.latest ?? null;
    const versionData = NpmVersionSchema.parse(resolveVersionData(npmData, range));
    const slug = parseRepoSlug(repositoryUrl(npmData) ?? "");
    const [gitStars, issueCounts, sourceTree] = await Promise.all([
        slug != null && isVisible("gitStars")
            ? withFallback(fetchCachedRepoStars(slug, headers), noData)
            : noData,
        slug != null && anyColumnVisible(visibleColumns, COLUMNS_FROM_ISSUE_SEARCH)
            ? withFallback(fetchCachedIssueCounts(slug, headers), fresh(EMPTY_ISSUE_COUNTS))
            : fresh(EMPTY_ISSUE_COUNTS),
        isVisible("sourceCodeTree")
            ? withFallback(resolveSourceTree(versionData, slug, range, headers), noData)
            : noData,
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
        weeklyDownloads: weeklyDownloads.value,
        sourceCode: isHttpUrl(sourceCode) ? sourceCode : null,
        gitStars: gitStars.value,
        ...issueCounts.value,
        dependencies: versionData.dependencies ? Object.keys(versionData.dependencies) : null,
        license: extractLicense(versionData.license) ?? extractLicense(npmData?.license),
        isOutdated: isVersionOutdated(range, latestVersion),
        deprecated: versionData.deprecated ?? null,
        vulnerabilityCount: vulnerabilityCount.value,
        bundleSizeGzip: bundleSizeGzip.value,
        maintainers: maintainerNames(npmData),
        sourceTree: sourceTree.value,
        staleSince: oldestStaleSince([
            registry,
            weeklyDownloads,
            vulnerabilityCount,
            bundleSizeGzip,
            gitStars,
            issueCounts,
            sourceTree,
        ]),
    };
}

/**
 * Fetches a package version's manifest (npm's per-version registry data,
 * essentially its package.json) as JSON text, for the drill-down action.
 * Shares the registry cache, and its offline store, with fetchPackageInfo.
 *
 * @returns The package.json text, or null if the package/version is unknown.
 */
export async function fetchPackageJsonForVersion(
    name: string,
    version: string,
): Promise<string | null> {
    const { registryName, range } = resolveRegistrySpec(name, version);
    const versionData = resolveVersionData((await fetchRegistryData(registryName)).value, range);
    if (!versionData) {
        return null;
    }
    return JSON.stringify(versionData, null, JSON_INDENT);
}

/**
 * Fetches enriched metadata for multiple packages, at most `concurrency`
 * at a time. A failing package yields a PackageError instead of rejecting.
 */
export async function fetchPackagesInfo(
    packages: PackageInput[],
    options: FetchPackagesOptions = {},
): Promise<DependencyRow[]> {
    const { concurrency = settings.fetchConcurrency, ...fetchOptions } = options;
    const results = Array.from<DependencyRow>({ length: packages.length });
    let nextIndex = 0;

    async function worker(): Promise<void> {
        while (nextIndex < packages.length) {
            const i = nextIndex++;
            const { name, version } = packages[i];
            const result = await settle(() => fetchPackageInfo(name, version, fetchOptions));
            results[i] = result.ok ? result.value : { name, version, error: result.error.message };
        }
    }

    await Promise.all(Array.from({ length: Math.min(concurrency, packages.length) }, worker));
    return results;
}

function fetchRegistryData(name: string): Promise<Lookup<NpmRegistryData | null>> {
    return memoizeLookup(registryDataCache, "registry", name, async () => {
        const data = await fetchJson(`${NPM_REGISTRY_URL}/${encodeURIComponent(name)}`);
        return data == null ? null : NpmRegistrySchema.parse(data);
    });
}

function fetchWeeklyDownloads(name: string): Promise<Lookup<number | null>> {
    return memoizeLookup(weeklyDownloadsCache, "weeklyDownloads", name, () =>
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
function fetchVulnerabilityCount(name: string): Promise<Lookup<number | null>> {
    return memoizeLookup(vulnerabilityCountCache, "vulnerabilityCount", name, async () => {
        const seenPageTokens = new Set<string>();
        let count = 0;
        let pageToken: string | undefined;
        for (let page = 1; page <= OSV_MAX_PAGES; page++) {
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
            pageToken = data.next_page_token;
            // A token seen before (A -> B -> A) would loop forever; treat it as the last page.
            if (!pageToken || seenPageTokens.has(pageToken)) {
                return count;
            }
            seenPageTokens.add(pageToken);
        }
        // Still paging after OSV_MAX_PAGES: the total is unknown, not `count`.
        return null;
    });
}

/** Min+gzip size via Bundlephobia. Version-scoped, since size differs across versions. Throws on failure. */
function fetchBundleGzipSize(name: string, range: string): Promise<Lookup<number | null>> {
    const pinnedVersion = pinnedVersionOf(range);
    const packageSpec = pinnedVersion ? `${name}@${pinnedVersion}` : name;
    return memoizeLookup(bundleSizeCache, "bundleSize", packageSpec, () =>
        fetchJson<BundlephobiaData>(
            `${BUNDLEPHOBIA_SIZE_URL}?package=${encodeURIComponent(packageSpec)}`,
        ).then((data) => data?.gzip ?? null),
    );
}

function fetchCachedRepoStars(
    slug: RepoSlug,
    headers: HttpHeaders,
): Promise<Lookup<number | null>> {
    return memoizeLookup(repoStarsCache, "repoStars", repoSlugKey(slug), () =>
        fetchRepoStars(slug, headers),
    );
}

function fetchCachedIssueCounts(
    slug: RepoSlug,
    headers: HttpHeaders,
): Promise<Lookup<RepoIssueCounts>> {
    return memoizeLookup(repoIssueCountsCache, "repoIssueCounts", repoSlugKey(slug), () =>
        fetchRepoIssueCounts(slug, headers),
    );
}

/**
 * How this version's source can be browsed: npm's tarball when listed
 * (nearly always), else a matching GitHub release tag. Other hosts get no
 * fallback; their tree/tag APIs differ and npm rarely lacks a tarball.
 */
async function resolveSourceTree(
    versionData: NpmVersionData,
    slug: RepoSlug | null,
    range: string,
    headers: HttpHeaders,
): Promise<Lookup<SourceTreeRef | null>> {
    // Registry data picks the URL; only http(s) may be fetched, never data: or blob:.
    const tarballUrl = versionData.dist?.tarball;
    if (isHttpUrl(tarballUrl)) {
        return fresh({ provider: "npm", tarballUrl });
    }
    const pinnedVersion = pinnedVersionOf(range);
    if (slug?.host !== GITHUB_HOST || !pinnedVersion) {
        return fresh(null);
    }
    const { value: tag, staleSince } = await memoizeLookup(
        githubReleaseTagCache,
        "githubReleaseTag",
        `${repoSlugKey(slug)}@${pinnedVersion}`,
        () => findGithubReleaseTag(slug.owner, slug.repo, pinnedVersion, headers),
    );
    if (!tag) {
        return { value: null, staleSince };
    }
    return { value: { provider: "github", owner: slug.owner, repo: slug.repo, tag }, staleSince };
}

type NpmVersionData = z.infer<typeof NpmVersionSchema>;

type NpmRegistryData = z.infer<typeof NpmRegistrySchema>;
