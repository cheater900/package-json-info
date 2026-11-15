import { z } from "zod";
import type {
    DependencyRow,
    FailedLookups,
    PackageInfo,
    PackageInput,
    SourceTreeRef,
} from "../types";
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
import { computeHealthScore } from "../utils/healthScore";
import { isColumnVisible, TOGGLEABLE_COLUMNS } from "../utils/tableColumns";
import { extractLicense, NpmLicenseSchema } from "../utils/license";
import { fresh, lookupKey, memoizeLookup, oldestStaleSince } from "../utils/memoizeLookup";
import type { Lookup, LookupKind } from "../utils/memoizeLookup";
import { resolveRegistrySpec } from "../utils/npmSpec";
import { settle } from "../utils/settle";
import { isHttpUrl } from "../utils/url";
import { normaliseRepoUrl, parseRepoSlug, repoSlugKey, repoWebUrl } from "../utils/repoUrl";
import type { RepoSlug } from "../utils/repoUrl";
import { coreRuntime } from "../runtime";
import { fetchJson } from "./http";
import type { HttpHeaders, RequestSubject } from "./http";
import { findGithubReleaseTag, githubHeaders } from "./github";
import {
    EMPTY_COMMIT_ACTIVITY,
    EMPTY_ISSUE_COUNTS,
    fetchRepoCommitActivity,
    fetchRepoIssueCounts,
    fetchRepoStars,
} from "./repoMetadata";
import type { RepoCommitActivity, RepoIssueCounts } from "./repoMetadata";

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

/** Shape checks of values read back from the offline store (see memoizeLookup). */
const StoredCountSchema = z.number().nullable();

const StoredCommitActivitySchema = z.object({
    lastCommitDate: z.string().nullable(),
    commitsLastYear: StoredCountSchema,
});

const StoredIssueCountsSchema = z.object({
    openPRs: StoredCountSchema,
    closedPRs: StoredCountSchema,
    openIssues: StoredCountSchema,
    closedIssues: StoredCountSchema,
});

const StoredRegistrySchema = NpmRegistrySchema.nullable();

const StoredReleaseTagSchema = z.string().nullable();

export type FetchPackageOptions = {
    /**
     * Columns currently visible in the UI. Network calls backing only
     * hidden columns are skipped. Omit to fetch everything.
     */
    visibleColumns?: ReadonlySet<string>;
    /** Name of the package.json whose dependencies these are; tags their requests. */
    rootPackage?: string | null;
};

/** Who asks for a lookup: a dependency row and the package.json it belongs to. */
type Requester = {
    dependency: string;
    rootPackage: string | null;
};

export type FetchPackagesOptions = FetchPackageOptions & {
    /** Maximum number of packages fetched in parallel. */
    concurrency?: number;
    /** Once true, no further package starts; the caller drops the result. */
    isCancelled?: () => boolean;
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

/** An optional lookup's answer; `error` is set when it failed live with nothing stored. */
type OptionalLookup<T> = Lookup<T> & {
    error?: string;
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
const repoCommitsCache = new Map<string, Promise<Lookup<RepoCommitActivity>>>();
const repoIssueCountsCache = new Map<string, Promise<Lookup<RepoIssueCounts>>>();
const githubReleaseTagCache = new Map<string, Promise<Lookup<string | null>>>();
/** Request subject per lookupKey; callers sharing a request share its subject. */
const subjectsByLookup = new Map<string, RequestSubject>();

/** Clears every in-memory metadata cache, e.g. after the proxy changes. */
export function clearPackageInfoCache(): void {
    registryDataCache.clear();
    weeklyDownloadsCache.clear();
    vulnerabilityCountCache.clear();
    bundleSizeCache.clear();
    repoStarsCache.clear();
    repoCommitsCache.clear();
    repoIssueCountsCache.clear();
    githubReleaseTagCache.clear();
    subjectsByLookup.clear();
}

/**
 * Subject of lookup `kind`/`key`, with the requester's dependency and
 * `columns` added and its root package set. Called on cache hits too, so a
 * shared request lists every dependency using it.
 */
function subjectFor(
    kind: LookupKind,
    key: string,
    requester: Requester,
    columns: readonly string[],
): RequestSubject {
    const subjectKey = lookupKey(kind, key);
    let subject = subjectsByLookup.get(subjectKey);
    if (!subject) {
        subject = coreRuntime().trackSubject({
            package: null,
            dependencies: new Set<string>(),
            columns: new Set<string>(),
        });
        subjectsByLookup.set(subjectKey, subject);
    }
    subject.package = requester.rootPackage;
    subject.dependencies.add(requester.dependency);
    for (const column of columns) {
        subject.columns.add(column);
    }
    return subject;
}

/**
 * Optional per-field lookups fall back to `fallback` so one failing service
 * can't fail the row; the error message is kept so the cells can tell
 * "lookup failed" from "no data".
 */
async function withFallback<T>(
    request: () => Promise<Lookup<T>>,
    fallback: T,
): Promise<OptionalLookup<T>> {
    const result = await settle(request);
    return result.ok ? result.value : { ...fresh(fallback), error: result.error.message };
}

/** Error message per column backed by a failed lookup; null when none failed. */
function failedColumns(lookups: [OptionalLookup<unknown>, string[]][]): FailedLookups | null {
    const failed = lookups.flatMap(([{ error }, columns]) =>
        error == null ? [] : columns.map((column) => [column, error]),
    );
    return failed.length > 0 ? Object.fromEntries(failed) : null;
}

function anyColumnVisible(visibleColumns: ReadonlySet<string>, keys: string[]): boolean {
    return keys.some((key) => isColumnVisible(visibleColumns, key));
}

/** Own keys only, so a key like "constructor" can't read Object.prototype. */
function isOwnKey(record: object, key: string | null | undefined): key is string {
    return key != null && Object.hasOwn(record, key);
}

/**
 * Registry key `range` refers to: itself when published, else its leading
 * semver ("^1.2.3" -> "1.2.3") when published, else the latest version.
 */
function resolveVersionKey(npmData: NpmRegistryData | null, range: string): string | undefined {
    const versions = npmData?.versions ?? {};
    return [range, pinnedVersionOf(range), npmData?.["dist-tags"]?.latest].find((key) =>
        isOwnKey(versions, key),
    );
}

/** Raw manifest of the version `range` refers to; undefined when unpublished. */
function resolveVersionData(npmData: NpmRegistryData | null, range: string): unknown {
    const key = resolveVersionKey(npmData, range);
    return key ? npmData?.versions?.[key] : undefined;
}

/** Publish time of registry key `key`; null when unpublished. */
function publishTime(
    times: Record<string, string | undefined>,
    key: string | null | undefined,
): string | null {
    return isOwnKey(times, key) ? (times[key] ?? null) : null;
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
    const { visibleColumns = COLUMNS_ALL_TOGGLEABLE, rootPackage = null } = options;
    const { registryName, range } = resolveRegistrySpec(name, version);
    const requester = { dependency: name, rootPackage };
    const isVisible = (key: string) => isColumnVisible(visibleColumns, key);
    const noData = fresh(null);
    const [registry, weeklyDownloads, vulnerabilityCount, bundleSizeGzip] = await Promise.all([
        anyColumnVisible(visibleColumns, COLUMNS_FROM_REGISTRY)
            ? fetchRegistryData(registryName, requester, COLUMNS_FROM_REGISTRY.filter(isVisible))
            : noData,
        isVisible("weeklyDownloads")
            ? withFallback(() => fetchWeeklyDownloads(registryName, requester), null)
            : noData,
        isVisible("vulnerabilityCount")
            ? withFallback(() => fetchVulnerabilityCount(registryName, requester), null)
            : noData,
        isVisible("bundleSizeGzip")
            ? withFallback(() => fetchBundleGzipSize(registryName, range, requester), null)
            : noData,
    ]);
    const npmData = registry.value;
    const times = npmData?.time ?? {};
    const latestVersion = npmData?.["dist-tags"]?.latest ?? null;
    const versionData = NpmVersionSchema.parse(resolveVersionData(npmData, range));
    const slug = parseRepoSlug(repositoryUrl(npmData) ?? "");
    // Read after the registry answer: a token purged or saved meanwhile must apply to repo lookups.
    const headers = githubHeaders();
    const [gitStars, commitActivity, issueCounts, sourceTree] = await Promise.all([
        slug != null && isVisible("gitStars")
            ? withFallback(() => fetchCachedRepoStars(slug, headers, requester), null)
            : noData,
        slug != null && isVisible("lastCommitDate")
            ? withFallback(
                  () => fetchCachedRepoCommits(slug, headers, requester),
                  EMPTY_COMMIT_ACTIVITY,
              )
            : fresh(EMPTY_COMMIT_ACTIVITY),
        slug != null && anyColumnVisible(visibleColumns, COLUMNS_FROM_ISSUE_SEARCH)
            ? withFallback(
                  () => fetchCachedIssueCounts(slug, headers, requester),
                  EMPTY_ISSUE_COUNTS,
              )
            : fresh(EMPTY_ISSUE_COUNTS),
        isVisible("sourceCodeTree")
            ? withFallback(
                  () => resolveSourceTree(versionData, slug, range, headers, requester),
                  null,
              )
            : noData,
    ]);
    const sourceCode =
        slug != null
            ? repoWebUrl(slug)
            : (normaliseRepoUrl(repositoryUrl(npmData)) ?? npmData?.homepage);
    const latestReleaseDate = publishTime(times, latestVersion);
    const isOutdated = isVersionOutdated(range, latestVersion);
    const deprecated = versionData.deprecated ?? null;
    const maintainers = maintainerNames(npmData);
    const health = computeHealthScore(
        {
            latestReleaseDate,
            // Without a registry document the deprecation state is unknown, not "not deprecated".
            deprecated: npmData ? deprecated : undefined,
            isOutdated,
            maintainers,
            openIssues: issueCounts.value.openIssues,
            closedIssues: issueCounts.value.closedIssues,
            vulnerabilityCount: vulnerabilityCount.value,
        },
        new Date(),
    );
    return {
        name,
        version,
        versionDate: publishTime(times, range) ?? publishTime(times, pinnedVersionOf(range)),
        latestVersion,
        latestReleaseDate,
        latestUpdateDate: publishTime(times, "modified"),
        weeklyDownloads: weeklyDownloads.value,
        sourceCode: isHttpUrl(sourceCode) ? sourceCode : null,
        gitStars: gitStars.value,
        ...commitActivity.value,
        ...issueCounts.value,
        dependencies: versionData.dependencies ? Object.keys(versionData.dependencies) : null,
        license: extractLicense(versionData.license) ?? extractLicense(npmData?.license),
        isOutdated,
        healthScore: health?.score ?? null,
        healthSignals: health?.signals ?? null,
        deprecated,
        vulnerabilityCount: vulnerabilityCount.value,
        bundleSizeGzip: bundleSizeGzip.value,
        maintainers,
        sourceTree: sourceTree.value,
        staleSince: oldestStaleSince([
            registry,
            weeklyDownloads,
            vulnerabilityCount,
            bundleSizeGzip,
            gitStars,
            commitActivity,
            issueCounts,
            sourceTree,
        ]),
        failedLookups: failedColumns([
            [weeklyDownloads, ["weeklyDownloads"]],
            [vulnerabilityCount, ["vulnerabilityCount"]],
            [bundleSizeGzip, ["bundleSizeGzip"]],
            [gitStars, ["gitStars"]],
            [commitActivity, ["lastCommitDate"]],
            [issueCounts, COLUMNS_FROM_ISSUE_SEARCH],
            [sourceTree, ["sourceCodeTree"]],
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
    const registry = await fetchRegistryData(
        registryName,
        { dependency: name, rootPackage: null },
        [],
    );
    const versionData = resolveVersionData(registry.value, range);
    if (!versionData) {
        return null;
    }
    return JSON.stringify(versionData, null, JSON_INDENT);
}

/**
 * Fetches enriched metadata for multiple packages, at most `concurrency`
 * at a time. A failing package yields a PackageError instead of rejecting.
 * Null once `isCancelled` stopped a package from starting: rows would be missing.
 */
export async function fetchPackagesInfo(
    packages: PackageInput[],
    options: FetchPackagesOptions = {},
): Promise<DependencyRow[] | null> {
    const {
        concurrency = coreRuntime().settings().fetchConcurrency,
        isCancelled = () => false,
        ...fetchOptions
    } = options;
    const results = Array.from<DependencyRow>({ length: packages.length });
    let nextIndex = 0;
    let wasCancelled = false;

    async function worker(): Promise<void> {
        while (nextIndex < packages.length) {
            wasCancelled ||= isCancelled();
            if (wasCancelled) {
                return;
            }
            const i = nextIndex++;
            const { name, version } = packages[i];
            const result = await settle(() => fetchPackageInfo(name, version, fetchOptions));
            results[i] = result.ok ? result.value : { name, version, error: result.error.message };
        }
    }

    await Promise.all(Array.from({ length: Math.min(concurrency, packages.length) }, worker));
    return wasCancelled ? null : results;
}

/** `name` is the registry name; `requester.dependency` the row name aliasing it (often the same). */
function fetchRegistryData(
    name: string,
    requester: Requester,
    columns: readonly string[],
): Promise<Lookup<NpmRegistryData | null>> {
    const subject = subjectFor("registry", name, requester, columns);
    return memoizeLookup(registryDataCache, "registry", name, StoredRegistrySchema, async () => {
        const data = await fetchJson(
            `${NPM_REGISTRY_URL}/${encodeURIComponent(name)}`,
            {},
            subject,
        );
        return data == null ? null : NpmRegistrySchema.parse(data);
    });
}

function fetchWeeklyDownloads(name: string, requester: Requester): Promise<Lookup<number | null>> {
    const subject = subjectFor("weeklyDownloads", name, requester, ["weeklyDownloads"]);
    return memoizeLookup(weeklyDownloadsCache, "weeklyDownloads", name, StoredCountSchema, () =>
        fetchJson<NpmDownloadsData>(
            `${NPM_WEEKLY_DOWNLOADS_URL}/${encodeURIComponent(name)}`,
            {},
            subject,
        ).then((d) => d?.downloads ?? null),
    );
}

/**
 * Known security advisories via OSV, following `next_page_token` across
 * result pages. Throws on failure; OSV may block browser requests (CORS,
 * rate limits).
 */
function fetchVulnerabilityCount(
    name: string,
    requester: Requester,
): Promise<Lookup<number | null>> {
    const subject = subjectFor("vulnerabilityCount", name, requester, ["vulnerabilityCount"]);
    return memoizeLookup(
        vulnerabilityCountCache,
        "vulnerabilityCount",
        name,
        StoredCountSchema,
        async () => {
            const seenPageTokens = new Set<string>();
            let count = 0;
            let pageToken: string | undefined;
            for (let page = 1; page <= OSV_MAX_PAGES; page++) {
                const data = await fetchJson<OsvQueryResponse>(
                    OSV_QUERY_URL,
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            package: { name, ecosystem: OSV_NPM_ECOSYSTEM },
                            page_token: pageToken,
                        }),
                    },
                    subject,
                );
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
        },
    );
}

/** Min+gzip size via Bundlephobia. Version-scoped, since size differs across versions. Throws on failure. */
function fetchBundleGzipSize(
    name: string,
    range: string,
    requester: Requester,
): Promise<Lookup<number | null>> {
    const pinnedVersion = pinnedVersionOf(range);
    const packageSpec = pinnedVersion ? `${name}@${pinnedVersion}` : name;
    const subject = subjectFor("bundleSize", packageSpec, requester, ["bundleSizeGzip"]);
    return memoizeLookup(bundleSizeCache, "bundleSize", packageSpec, StoredCountSchema, () =>
        fetchJson<BundlephobiaData>(
            `${BUNDLEPHOBIA_SIZE_URL}?package=${encodeURIComponent(packageSpec)}`,
            {},
            subject,
        ).then((data) => data?.gzip ?? null),
    );
}

function fetchCachedRepoStars(
    slug: RepoSlug,
    headers: HttpHeaders,
    requester: Requester,
): Promise<Lookup<number | null>> {
    const key = repoSlugKey(slug);
    const subject = subjectFor("repoStars", key, requester, ["gitStars"]);
    return memoizeLookup(repoStarsCache, "repoStars", key, StoredCountSchema, () =>
        fetchRepoStars(slug, headers, subject),
    );
}

function fetchCachedRepoCommits(
    slug: RepoSlug,
    headers: HttpHeaders,
    requester: Requester,
): Promise<Lookup<RepoCommitActivity>> {
    const key = repoSlugKey(slug);
    const subject = subjectFor("repoCommits", key, requester, ["lastCommitDate"]);
    return memoizeLookup(repoCommitsCache, "repoCommits", key, StoredCommitActivitySchema, () =>
        fetchRepoCommitActivity(slug, headers, subject),
    );
}

function fetchCachedIssueCounts(
    slug: RepoSlug,
    headers: HttpHeaders,
    requester: Requester,
): Promise<Lookup<RepoIssueCounts>> {
    const key = repoSlugKey(slug);
    const subject = subjectFor("repoIssueCounts", key, requester, COLUMNS_FROM_ISSUE_SEARCH);
    return memoizeLookup(
        repoIssueCountsCache,
        "repoIssueCounts",
        key,
        StoredIssueCountsSchema,
        () => fetchRepoIssueCounts(slug, headers, subject),
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
    requester: Requester,
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
    const key = `${repoSlugKey(slug)}@${pinnedVersion}`;
    const subject = subjectFor("githubReleaseTag", key, requester, ["sourceCodeTree"]);
    const { value: tag, staleSince } = await memoizeLookup(
        githubReleaseTagCache,
        "githubReleaseTag",
        key,
        StoredReleaseTagSchema,
        () => findGithubReleaseTag(slug.owner, slug.repo, pinnedVersion, headers, subject),
    );
    if (!tag) {
        return { value: null, staleSince };
    }
    return { value: { provider: "github", owner: slug.owner, repo: slug.repo, tag }, staleSince };
}

type NpmVersionData = z.infer<typeof NpmVersionSchema>;

type NpmRegistryData = z.infer<typeof NpmRegistrySchema>;
