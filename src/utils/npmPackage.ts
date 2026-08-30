import type { PackageInfo, PackageInput, PackageError } from "../types";
import { isVersionOutdated } from "./semver";
import { isColumnVisible } from "./tableColumns";

// ── Internal npm / GitHub response shapes ────────────────────────────────────

export type FetchPackageOptions = {
    githubToken?: string;
    /**
     * Columns currently hidden in the UI. Any network call that exists only
     * to back a hidden column is skipped entirely (see the column-gating
     * notes near NPM_DATA_DEPENDENT_COLUMNS below). Omit to fetch everything
     * (equivalent to an empty set - nothing hidden).
     */
    hiddenColumns?: ReadonlySet<string>;
};

export type FetchPackagesOptions = FetchPackageOptions & {
    /** Maximum number of packages fetched in parallel. */
    concurrency?: number;
    /** Called after each package resolves (successfully or not). */
    onProgress?: (result: PackageInfo | PackageError, index: number, total: number) => void;
};

type NpmRepository = {
    type?: string;
    url?: string;
};

/** npm's license field can be a string, `{ type }`, or (in old packages) an array of either. */
type NpmLicenseField = string | { type?: string } | Array<string | { type?: string }>;

type NpmVersionData = {
    dependencies?: Record<string, string>;
    license?: NpmLicenseField;
    deprecated?: string;
};

type NpmRegistryData = {
    "dist-tags"?: Record<string, string>;
    time?: Record<string, string>;
    repository?: NpmRepository | string;
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

type GithubRepoData = {
    stargazers_count?: number;
};

type GithubSearchData = {
    total_count?: number;
};

type GitlabProjectData = {
    star_count?: number;
};

type CodebergRepoData = {
    stars_count?: number;
};

/** A parsed `{ host, owner, repo }` reference to a source code repository. */
type RepoSlug = {
    host: string;
    owner: string;
    repo: string;
};

type RepoMetadata = {
    stars: number | null;
    openPRs: number | null;
    closedPRs: number | null;
    openIssues: number | null;
    closedIssues: number | null;
};

const EMPTY_REPO_METADATA: RepoMetadata = {
    stars: null,
    openPRs: null,
    closedPRs: null,
    openIssues: null,
    closedIssues: null,
};

/** Hosts we know how to pull a star count from. */
const STAR_SUPPORTED_HOSTS = ["github.com", "gitlab.com", "codeberg.org"];

// ── Caching ──────────────────────────────────────────────────────────────────
//
// Nested dependency trees very commonly share the same npm package across
// many entries — sometimes the exact same (name, version) pair, but even
// more often just the same *name* at different declared version ranges
// (e.g. a project's own devDependency on "typescript" alongside a nested
// dependency that also requires "typescript", at a slightly different
// range). Almost every network call fetchPackageInfo makes is keyed by
// name alone (the npm registry document, weekly downloads, security
// advisories) or by the resolved repo slug alone (stars/PR/issue counts —
// several npm packages can even share one repo, e.g. a monorepo), not by
// the caller's declared version. So each of those is cached independently
// by its own natural key.
//
// Every cache holds *promises*, not just resolved values: these lookups
// routinely fire concurrently (e.g. the same package appearing in both
// `dependencies` and `devDependencies`, fetched by two separate watchers),
// so caching only completed results would still let concurrent callers
// race off and issue duplicate requests before the first one finishes.
// Caching the in-flight promise means every later caller for the same key
// just awaits the first caller's request. All caches are scoped to this
// module's lifetime (i.e. the page load), not persisted across reloads.
//
// There is deliberately no top-level "whole PackageInfo" cache on top of
// these: which fields get fetched at all depends on which columns are
// visible (see column gating below), and that can change from one call to
// the next as the user toggles the column panel. Re-deriving the composed
// object per call is cheap - it's just a handful of already-cached (or
// newly-needed) sub-fetches plus synchronous field mapping - so the real
// deduplication work all happens at the sub-fetch level below.

function memoizeAsync<T>(
    cache: Map<string, Promise<T>>,
    key: string,
    fn: () => Promise<T>,
): Promise<T> {
    const cached = cache.get(key);
    if (cached) {
        return cached;
    }
    const request = fn();
    cache.set(key, request);
    // A failed lookup shouldn't stay cached forever - let the next call retry.
    request.catch(() => cache.delete(key));
    return request;
}

const registryDataCache = new Map<string, Promise<NpmRegistryData | null>>();
const weeklyDownloadsCache = new Map<string, Promise<number | null>>();
const vulnerabilityCountCache = new Map<string, Promise<number | null>>();
const bundleSizeCache = new Map<string, Promise<number | null>>();
const repoMetadataCache = new Map<string, Promise<RepoMetadata>>();

function nameVersionKey(name: string, version: string): string {
    return `${name}@${version}`;
}

function repoSlugKey(slug: RepoSlug): string {
    return `${slug.host}/${slug.owner}/${slug.repo}`;
}

/** Clears every in-memory metadata cache. Exposed for tests. */
export function clearPackageInfoCache(): void {
    registryDataCache.clear();
    weeklyDownloadsCache.clear();
    vulnerabilityCountCache.clear();
    bundleSizeCache.clear();
    repoMetadataCache.clear();
}

// ── Column gating ────────────────────────────────────────────────────────────
//
// Fetching data to back a column nobody can currently see is wasted work -
// and for the security-advisory and bundle-size lookups in particular,
// wasted external API calls against services with their own rate limits.
// So before fetching anything, work out which of the four independently
// skippable network calls are actually needed for the columns that are
// currently visible.

/** Columns whose value comes from the npm registry document (directly, or
 * indirectly via the repo slug it's used to derive for repo metadata). */
const NPM_DATA_DEPENDENT_COLUMNS = [
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
    "gitStars",
    "openPRs",
    "closedPRs",
    "openIssues",
    "closedIssues",
];

/** Columns backed by the stars/PR/issue-count lookup against the repo host. */
const REPO_METADATA_COLUMNS = ["gitStars", "openPRs", "closedPRs", "openIssues", "closedIssues"];

function anyColumnVisible(hiddenColumns: ReadonlySet<string>, keys: string[]): boolean {
    return keys.some((key) => isColumnVisible(hiddenColumns, key));
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Fetches enriched metadata for a single npm package, skipping any network
 * call that exists only to back a currently-hidden column, and reusing
 * in-flight or already-completed requests wherever the underlying data is
 * shared with another package (see the caching notes above).
 *
 * @param name    - The npm package name (e.g. "lodash")
 * @param version - The version you currently use (e.g. "4.17.21")
 * @param options - Optional config: GitHub token, hidden columns
 */
export async function fetchPackageInfo(
    name: string,
    version: string,
    options: FetchPackageOptions = {},
): Promise<PackageInfo> {
    const { githubToken, hiddenColumns = new Set<string>() } = options;

    const githubHeaders: Record<string, string> = {
        Accept: "application/vnd.github+json",
    };
    if (githubToken) {
        githubHeaders["Authorization"] = `Bearer ${githubToken}`;
    }

    // ── 1. NPM registry + weekly downloads + advisories + bundle size (parallel) ─

    const needsRegistryData = anyColumnVisible(hiddenColumns, NPM_DATA_DEPENDENT_COLUMNS);
    const needsDownloads = isColumnVisible(hiddenColumns, "weeklyDownloads");
    const needsVulnerabilityCount = isColumnVisible(hiddenColumns, "vulnerabilityCount");
    const needsBundleSize = isColumnVisible(hiddenColumns, "bundleSizeGzip");

    const [npmData, downloads, vulnerabilityCount, bundleSizeGzip] = await Promise.all([
        needsRegistryData ? fetchRegistryData(name) : Promise.resolve(null),
        needsDownloads ? fetchWeeklyDownloads(name) : Promise.resolve(null),
        needsVulnerabilityCount ? fetchVulnerabilityCount(name) : Promise.resolve(null),
        needsBundleSize ? fetchBundleGzipSize(name, version) : Promise.resolve(null),
    ]);

    const times: Record<string, string> = npmData?.time ?? {};
    const latestVersion = npmData?.["dist-tags"]?.latest ?? null;
    const versionDate = times[version] ?? null;
    const latestReleaseDate = latestVersion ? (times[latestVersion] ?? null) : null;
    const latestUpdateDate = times["modified"] ?? null;

    const versionData =
        npmData?.versions?.[version] ??
        (latestVersion ? npmData?.versions?.[latestVersion] : undefined);
    const dependencies = versionData?.dependencies ? Object.keys(versionData.dependencies) : null;

    const license = extractLicense(versionData?.license) ?? extractLicense(npmData?.license);
    const deprecated = versionData?.deprecated ?? null;
    const isOutdated = isVersionOutdated(version, latestVersion);
    const maintainerNames = npmData?.maintainers
        ?.map((m) => m.name)
        .filter((n): n is string => Boolean(n));
    const maintainers = maintainerNames && maintainerNames.length > 0 ? maintainerNames : null;

    // ── 2. Extract a repo slug (any of GitHub/GitLab/Codeberg) from npm metadata ─

    const slug = extractRepoSlug(npmData);
    const repoUrl =
        typeof npmData?.repository === "string" ? npmData.repository : npmData?.repository?.url;
    const sourceCodeUrl =
        slug != null
            ? `https://${slug.host}/${slug.owner}/${slug.repo}`
            : (normaliseRepoUrl(repoUrl) ?? npmData?.homepage ?? null);

    // ── 3. Stars (any supported host) + GitHub-only PR/issue counts ────────────

    const repoMetadata =
        slug != null && anyColumnVisible(hiddenColumns, REPO_METADATA_COLUMNS)
            ? await fetchRepoMetadata(slug, githubHeaders)
            : EMPTY_REPO_METADATA;

    return {
        name,
        version,
        versionDate,
        latestVersion,
        latestReleaseDate,
        latestUpdateDate,
        weeklyDownloads: downloads,
        sourceCode: sourceCodeUrl,
        gitStars: repoMetadata.stars,
        openPRs: repoMetadata.openPRs,
        closedPRs: repoMetadata.closedPRs,
        openIssues: repoMetadata.openIssues,
        closedIssues: repoMetadata.closedIssues,
        dependencies,
        license,
        isOutdated,
        deprecated,
        vulnerabilityCount,
        bundleSizeGzip,
        maintainers,
    };
}

/**
 * Fetches the package.json-shaped manifest for a specific package version -
 * npm's per-version registry data is essentially that package's own
 * package.json (name, dependencies, devDependencies, scripts, etc.) -
 * serialized as JSON text ready to feed back into the app as new input.
 * This is the "load this package's table" drill-down action.
 *
 * Falls back to the latest published version if `version` (typically a
 * semver range, e.g. "^3.5.34") isn't itself a resolvable registry key,
 * same fallback fetchPackageInfo uses for versionData elsewhere.
 *
 * Reuses the same cached registry-document fetch as fetchPackageInfo, so
 * drilling into a package already shown in the table costs no extra
 * network request.
 *
 * @returns The package.json text, or null if the package/version couldn't
 *          be resolved.
 */
export async function fetchPackageJsonForVersion(
    name: string,
    version: string,
): Promise<string | null> {
    const npmData = await fetchRegistryData(name);
    const latestVersion = npmData?.["dist-tags"]?.latest;
    const versionData =
        npmData?.versions?.[version] ??
        (latestVersion ? npmData?.versions?.[latestVersion] : undefined);
    if (!versionData) {
        return null;
    }
    return JSON.stringify(versionData, null, 2);
}

/**
 * Fetches enriched metadata for multiple packages, with bounded parallelism.
 *
 * @param packages - Array of `{ name, version }` objects
 * @param options  - Optional config: GitHub token, concurrency limit, progress callback
 */
export async function fetchPackagesInfo(
    packages: PackageInput[],
    options: FetchPackagesOptions = {},
): Promise<Array<PackageInfo | PackageError>> {
    const { concurrency = 5, onProgress, ...fetchOptions } = options;

    const results = new Array<PackageInfo | PackageError>(packages.length);
    let index = 0;

    // Worker: pulls the next package off the shared queue and fetches it
    async function worker(): Promise<void> {
        while (index < packages.length) {
            const i = index++;
            const { name, version } = packages[i];
            try {
                const result = await fetchPackageInfo(name, version, fetchOptions);
                results[i] = result;
                onProgress?.(result, i, packages.length);
            } catch (err) {
                const failure: PackageError = {
                    name,
                    version,
                    error: err instanceof Error ? err.message : String(err),
                };
                results[i] = failure;
                onProgress?.(failure, i, packages.length);
            }
        }
    }

    // Spin up N workers; they all compete on the same `index` counter
    await Promise.all(Array.from({ length: Math.min(concurrency, packages.length) }, worker));

    return results;
}

// ── Cached, name/slug-scoped fetchers ───────────────────────────────────────

function fetchRegistryData(name: string): Promise<NpmRegistryData | null> {
    return memoizeAsync(registryDataCache, name, () =>
        fetchJson<NpmRegistryData>(`https://registry.npmjs.org/${encodeURIComponent(name)}`),
    );
}

function fetchWeeklyDownloads(name: string): Promise<number | null> {
    return memoizeAsync(weeklyDownloadsCache, name, () =>
        fetchJson<NpmDownloadsData>(
            `https://api.npmjs.org/downloads/point/last-week/${encodeURIComponent(name)}`,
        ).then((d) => d?.downloads ?? null),
    );
}

/**
 * Looks up known security advisories for a package via the OSV database.
 * Best-effort: the OSV API isn't guaranteed to be reachable from a browser
 * (rate limits, CORS, network errors), so any failure resolves to null
 * (unknown) rather than failing the whole package lookup.
 */
function fetchVulnerabilityCount(name: string): Promise<number | null> {
    return memoizeAsync(vulnerabilityCountCache, name, async () => {
        try {
            const response = await fetch("https://api.osv.dev/v1/query", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ package: { name, ecosystem: "npm" } }),
            });
            if (!response.ok) return null;
            const data = (await response.json()) as OsvQueryResponse;
            return data.vulns?.length ?? 0;
        } catch {
            return null;
        }
    });
}

/**
 * Looks up the min+gzip bundle size for a package via Bundlephobia.
 * Best-effort, same reasoning as fetchVulnerabilityCount: Bundlephobia's
 * API isn't guaranteed to allow cross-origin browser requests, so any
 * failure resolves to null (unknown). Genuinely version-scoped, unlike
 * the other lookups here, since bundle size can differ across versions.
 */
function fetchBundleGzipSize(name: string, version: string): Promise<number | null> {
    return memoizeAsync(bundleSizeCache, nameVersionKey(name, version), async () => {
        try {
            const pinnedVersion = version.match(/\d+\.\d+\.\d+/)?.[0];
            const packageSpec = pinnedVersion ? `${name}@${pinnedVersion}` : name;
            const data = await fetchJson<BundlephobiaData>(
                `https://bundlephobia.com/api/size?package=${encodeURIComponent(packageSpec)}`,
            );
            return data?.gzip ?? null;
        } catch {
            return null;
        }
    });
}

/**
 * Stars + GitHub-only PR/issue counts for a repo, cached by repo slug so
 * multiple npm packages pointing at the same repository (a common
 * monorepo pattern) only trigger one set of host API calls.
 *
 * Note: the GitHub auth header used is whichever caller's request first
 * populates this cache entry for a given slug - a second caller passing a
 * different githubToken won't get its own token applied to a cache hit.
 * Not a concern in practice today since nothing in this app varies the
 * token per call.
 */
function fetchRepoMetadata(
    slug: RepoSlug,
    githubHeaders: Record<string, string>,
): Promise<RepoMetadata> {
    return memoizeAsync(repoMetadataCache, repoSlugKey(slug), async () => {
        if (slug.host === "github.com") {
            const githubSlug = `${slug.owner}/${slug.repo}`;
            const searchUrl = (q: string): string =>
                `https://api.github.com/search/issues?q=repo:${githubSlug}+${q}&per_page=1`;

            const [repoData, openPRRes, closedPRRes, openIssueRes, closedIssueRes] =
                await Promise.all([
                    fetchJson<GithubRepoData>(
                        `https://api.github.com/repos/${githubSlug}`,
                        githubHeaders,
                    ),
                    fetchJson<GithubSearchData>(searchUrl("is:pr+is:open"), githubHeaders),
                    fetchJson<GithubSearchData>(searchUrl("is:pr+is:closed"), githubHeaders),
                    fetchJson<GithubSearchData>(searchUrl("is:issue+is:open"), githubHeaders),
                    fetchJson<GithubSearchData>(searchUrl("is:issue+is:closed"), githubHeaders),
                ]);

            return {
                stars: repoData?.stargazers_count ?? null,
                openPRs: openPRRes?.total_count ?? null,
                closedPRs: closedPRRes?.total_count ?? null,
                openIssues: openIssueRes?.total_count ?? null,
                closedIssues: closedIssueRes?.total_count ?? null,
            };
        }

        if (slug.host === "gitlab.com") {
            const projectData = await fetchJson<GitlabProjectData>(
                `https://gitlab.com/api/v4/projects/${encodeURIComponent(`${slug.owner}/${slug.repo}`)}`,
            );
            return { ...EMPTY_REPO_METADATA, stars: projectData?.star_count ?? null };
        }

        if (slug.host === "codeberg.org") {
            const repoData = await fetchJson<CodebergRepoData>(
                `https://codeberg.org/api/v1/repos/${slug.owner}/${slug.repo}`,
            );
            return { ...EMPTY_REPO_METADATA, stars: repoData?.stars_count ?? null };
        }

        return EMPTY_REPO_METADATA;
    });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * GETs a URL and parses the response as JSON.
 * Returns `null` on non-2xx responses; throws only on network failures.
 */
async function fetchJson<T>(url: string, headers: Record<string, string> = {}): Promise<T | null> {
    const response = await fetch(url, { headers });
    if (!response.ok) return null;
    return response.json() as Promise<T>;
}

/**
 * Extracts a `{ host, owner, repo }` slug from npm registry data, for any
 * of the hosts we can pull a star count from (GitHub, GitLab, Codeberg).
 * Handles git+https://, git://, ssh://git@, git@host:owner/repo (scp-like),
 * and the shorthand github:owner/repo.
 */
function extractRepoSlug(npmData: NpmRegistryData | null): RepoSlug | null {
    if (npmData == null) return null;
    const repo = npmData.repository;
    if (repo == null) return null;
    const raw = typeof repo === "string" ? repo : (repo.url ?? "");
    return parseRepoSlug(raw);
}

function parseRepoSlug(raw: string): RepoSlug | null {
    if (!raw) return null;
    const normalised = raw
        .replace(/^git\+/, "")
        .replace(/\.git$/, "")
        .replace(/^git:\/\//, "https://")
        .replace(/^ssh:\/\/git@/, "https://")
        .replace(/^git@([^:]+):/, "https://$1/")
        .replace(/^github:/, "https://github.com/");

    for (const host of STAR_SUPPORTED_HOSTS) {
        const pattern = new RegExp(`${host.replace(/\./g, "\\.")}/([^/]+)/([^/?#\\s]+)`, "i");
        const match = normalised.match(pattern);
        if (match) {
            return { host, owner: match[1], repo: match[2] };
        }
    }
    return null;
}

function normaliseRepoUrl(raw: string | undefined): string | null {
    if (!raw) return null;
    return raw
        .replace(/^git\+/, "")
        .replace(/^git:\/\//, "https://")
        .replace(/^ssh:\/\/git@/, "https://")
        .replace(/\.git$/, "");
}

/**
 * Normalises npm's license field, which can be an SPDX string, a legacy
 * `{ type }` object, or (in very old packages) an array of either.
 */
function extractLicense(value: NpmLicenseField | undefined): string | null {
    if (!value) return null;
    if (typeof value === "string") return value;
    if (Array.isArray(value)) {
        const names = value.map(extractLicense).filter((v): v is string => Boolean(v));
        return names.length > 0 ? names.join(" OR ") : null;
    }
    return value.type ?? null;
}
