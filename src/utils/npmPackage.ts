import type {
  PackageInfo,
  PackageInput,
  PackageError,
} from "../types";

// ── Internal npm / GitHub response shapes ────────────────────────────────────

export type FetchPackageOptions = {
  githubToken?: string;
}

export type FetchPackagesOptions = FetchPackageOptions & {
  /** Maximum number of packages fetched in parallel. */
  concurrency?: number;
  /** Called after each package resolves (successfully or not). */
  onProgress?: (
    result: PackageInfo | PackageError,
    index: number,
    total: number
  ) => void;
}


type NpmRepository = {
  type?: string;
  url?: string;
}

type NpmRegistryData = {
  "dist-tags"?: Record<string, string>;
  time?: Record<string, string>;
  repository?: NpmRepository | string;
  homepage?: string;
}

type NpmDownloadsData = {
  downloads?: number;
}

type GithubRepoData = {
  stargazers_count?: number;
}

type GithubSearchData = {
  total_count?: number;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Fetches enriched metadata for a single npm package.
 *
 * @param name    - The npm package name (e.g. "lodash")
 * @param version - The version you currently use (e.g. "4.17.21")
 * @param options - Optional config including a GitHub token
 */
export async function fetchPackageInfo(
  name: string,
  version: string,
  options: FetchPackageOptions = {}
): Promise<PackageInfo> {
  const { githubToken } = options;

  const githubHeaders: Record<string, string> = {
    Accept: "application/vnd.github+json",
  };
  if (githubToken) {
    githubHeaders['Authorization'] = `Bearer ${githubToken}`
  }

  // ── 1. NPM registry + weekly downloads (parallel) ──────────────────────────

  const [npmData, downloads] = await Promise.all([
    fetchJson<NpmRegistryData>(
      `https://registry.npmjs.org/${encodeURIComponent(name)}`
    ),
    fetchJson<NpmDownloadsData>(
      `https://api.npmjs.org/downloads/point/last-week/${encodeURIComponent(name)}`
    ).then((d) => d?.downloads ?? null),
  ]);

  const times: Record<string, string> = npmData?.time ?? {};
  const latestVersion = npmData?.["dist-tags"]?.latest ?? null;
  const versionDate = times[version] ?? null;
  const latestReleaseDate = latestVersion ? (times[latestVersion] ?? null) : null;
  const latestUpdateDate = times["modified"] ?? null;
  console.log('im here...')

  // ── 2. Extract GitHub slug from npm metadata ────────────────────────────────

  const slug = extractGithubSlug(npmData);
  const repoUrl =
    typeof npmData?.repository === "string"
      ? npmData.repository
      : npmData?.repository?.url;
  const sourceCodeUrl =
    slug != null
      ? `https://github.com/${slug}`
      : (normaliseRepoUrl(repoUrl) ?? npmData?.homepage ?? null);

  // ── 3. GitHub data (all in parallel, only if we have a slug) ───────────────

  let stars: number | null = null;
  let openPRs: number | null = null;
  let openIssues: number | null = null;
  let totalPRs: number | null = null;
  let totalIssues: number | null = null;

  if (slug != null) {
    const searchUrl = (q: string): string =>
      `https://api.github.com/search/issues?q=repo:${slug}+${q}&per_page=1`;

    const [repoData, openPRRes, openIssueRes, totalPRRes, totalIssueRes] =
      await Promise.all([
        fetchJson<GithubRepoData>(
          `https://api.github.com/repos/${slug}`,
          githubHeaders
        ),
        fetchJson<GithubSearchData>(
          searchUrl("is:pr+is:open"),
          githubHeaders
        ),
        fetchJson<GithubSearchData>(
          searchUrl("is:issue+is:open"),
          githubHeaders
        ),
        fetchJson<GithubSearchData>(searchUrl("is:pr"), githubHeaders),
        fetchJson<GithubSearchData>(searchUrl("is:issue"), githubHeaders),
      ]);

    stars = repoData?.stargazers_count ?? null;
    openPRs = openPRRes?.total_count ?? null;
    openIssues = openIssueRes?.total_count ?? null;
    totalPRs = totalPRRes?.total_count ?? null;
    totalIssues = totalIssueRes?.total_count ?? null;
  }

  return {
    name,
    version,
    versionDate,
    latestVersion,
    latestReleaseDate,
    latestUpdateDate,
    weeklyDownloads: downloads,
    sourceCode: sourceCodeUrl,
    gitStars: stars,
    openPRs,
    openIssues,
    totalPRs,
    totalIssues,
  };
}

/**
 * Fetches enriched metadata for multiple packages, with bounded parallelism.
 *
 * @param packages - Array of `{ name, version }` objects
 * @param options  - Optional config: GitHub token, concurrency limit, progress callback
 */
export async function fetchPackagesInfo(
  packages: PackageInput[],
  options: FetchPackagesOptions = {}
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
  await Promise.all(
    Array.from({ length: Math.min(concurrency, packages.length) }, worker)
  );

  return results;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * GETs a URL and parses the response as JSON.
 * Returns `null` on non-2xx responses; throws only on network failures.
 */
async function fetchJson<T>(
  url: string,
  headers: Record<string, string> = {}
): Promise<T | null> {
  const response = await fetch(url, { headers });
  if (!response.ok) return null;
  return response.json() as Promise<T>;
}

/**
 * Extracts an "owner/repo" GitHub slug from npm registry data.
 * Handles git+https://, git://, ssh://git@, and shorthand github:owner/repo.
 */
function extractGithubSlug(npmData: NpmRegistryData | null): string | null {
  if (npmData == null) return null;
  const repo = npmData.repository;
  if (repo == null) return null;
  const raw = typeof repo === "string" ? repo : (repo.url ?? "");
  return parseGithubSlug(raw);
}

function parseGithubSlug(raw: string): string | null {
  if (!raw) return null;
  const normalised = raw
    .replace(/^git\+/, "")
    .replace(/\.git$/, "")
    .replace(/^git:\/\/github\.com\//, "https://github.com/")
    .replace(/^ssh:\/\/git@github\.com\//, "https://github.com/")
    .replace(/^github:/, "https://github.com/");
  const match = normalised.match(/github\.com\/([^/]+\/[^/?#\s]+)/i);
  return match ? match[1] : null;
}

function normaliseRepoUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  return raw
    .replace(/^git\+/, "")
    .replace(/^git:\/\//, "https://")
    .replace(/^ssh:\/\/git@/, "https://")
    .replace(/\.git$/, "");
}
