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

type NpmVersionData = {
  dependencies?: Record<string, string>;
}

type NpmRegistryData = {
  "dist-tags"?: Record<string, string>;
  time?: Record<string, string>;
  repository?: NpmRepository | string;
  homepage?: string;
  versions?: Record<string, NpmVersionData>;
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

type GitlabProjectData = {
  star_count?: number;
}

type CodebergRepoData = {
  stars_count?: number;
}

/** A parsed `{ host, owner, repo }` reference to a source code repository. */
type RepoSlug = {
  host: string;
  owner: string;
  repo: string;
}

/** Hosts we know how to pull a star count from. */
const STAR_SUPPORTED_HOSTS = ["github.com", "gitlab.com", "codeberg.org"];

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

  const versionData =
    npmData?.versions?.[version] ??
    (latestVersion ? npmData?.versions?.[latestVersion] : undefined);
  const dependencies = versionData?.dependencies
    ? Object.keys(versionData.dependencies)
    : null;

  // ── 2. Extract a repo slug (any of GitHub/GitLab/Codeberg) from npm metadata ─

  const slug = extractRepoSlug(npmData);
  const repoUrl =
    typeof npmData?.repository === "string"
      ? npmData.repository
      : npmData?.repository?.url;
  const sourceCodeUrl =
    slug != null
      ? `https://${slug.host}/${slug.owner}/${slug.repo}`
      : (normaliseRepoUrl(repoUrl) ?? npmData?.homepage ?? null);

  // ── 3. Stars (any supported host) + GitHub-only PR/issue counts ────────────

  let stars: number | null = null;
  let openPRs: number | null = null;
  let closedPRs: number | null = null;
  let openIssues: number | null = null;
  let closedIssues: number | null = null;

  if (slug?.host === "github.com") {
    const githubSlug = `${slug.owner}/${slug.repo}`;
    const searchUrl = (q: string): string =>
      `https://api.github.com/search/issues?q=repo:${githubSlug}+${q}&per_page=1`;

    const [repoData, openPRRes, closedPRRes, openIssueRes, closedIssueRes] =
      await Promise.all([
        fetchJson<GithubRepoData>(
          `https://api.github.com/repos/${githubSlug}`,
          githubHeaders
        ),
        fetchJson<GithubSearchData>(
          searchUrl("is:pr+is:open"),
          githubHeaders
        ),
        fetchJson<GithubSearchData>(
          searchUrl("is:pr+is:closed"),
          githubHeaders
        ),
        fetchJson<GithubSearchData>(
          searchUrl("is:issue+is:open"),
          githubHeaders
        ),
        fetchJson<GithubSearchData>(
          searchUrl("is:issue+is:closed"),
          githubHeaders
        ),
      ]);

    stars = repoData?.stargazers_count ?? null;
    openPRs = openPRRes?.total_count ?? null;
    closedPRs = closedPRRes?.total_count ?? null;
    openIssues = openIssueRes?.total_count ?? null;
    closedIssues = closedIssueRes?.total_count ?? null;
  } else if (slug?.host === "gitlab.com") {
    const projectData = await fetchJson<GitlabProjectData>(
      `https://gitlab.com/api/v4/projects/${encodeURIComponent(`${slug.owner}/${slug.repo}`)}`
    );
    stars = projectData?.star_count ?? null;
  } else if (slug?.host === "codeberg.org") {
    const repoData = await fetchJson<CodebergRepoData>(
      `https://codeberg.org/api/v1/repos/${slug.owner}/${slug.repo}`
    );
    stars = repoData?.stars_count ?? null;
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
    closedPRs,
    openIssues,
    closedIssues,
    dependencies,
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
