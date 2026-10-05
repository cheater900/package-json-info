import {
    CODEBERG_API_URL,
    CODEBERG_HOST,
    GITHUB_API_URL,
    GITHUB_HOST,
    GITLAB_API_URL,
    GITLAB_HOST,
} from "../constants";
import type { RepoSlug } from "../utils/repoUrl";
import { githubRepoApiUrl } from "./github";
import { fetchJson } from "./http";
import type { HttpHeaders } from "./http";

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

export type RepoMetadata = {
    stars: number | null;
    openPRs: number | null;
    closedPRs: number | null;
    openIssues: number | null;
    closedIssues: number | null;
};

type RepoMetadataFetcher = (slug: RepoSlug, githubHeaders: HttpHeaders) => Promise<RepoMetadata>;

export const EMPTY_REPO_METADATA: RepoMetadata = {
    stars: null,
    openPRs: null,
    closedPRs: null,
    openIssues: null,
    closedIssues: null,
};

/** Stars plus PR/issue counts; only GitHub exposes the counts. */
async function fetchGithubMetadata(slug: RepoSlug, headers: HttpHeaders): Promise<RepoMetadata> {
    const countMatching = (filter: string) =>
        fetchJson<GithubSearchData>(
            `${GITHUB_API_URL}/search/issues?q=repo:${slug.owner}/${slug.repo}+${filter}&per_page=1`,
            headers,
        ).then((data) => data?.total_count ?? null);
    const [repoData, openPRs, closedPRs, openIssues, closedIssues] = await Promise.all([
        fetchJson<GithubRepoData>(githubRepoApiUrl(slug.owner, slug.repo), headers),
        countMatching("is:pr+is:open"),
        countMatching("is:pr+is:closed"),
        countMatching("is:issue+is:open"),
        countMatching("is:issue+is:closed"),
    ]);
    return {
        stars: repoData?.stargazers_count ?? null,
        openPRs,
        closedPRs,
        openIssues,
        closedIssues,
    };
}

async function fetchGitlabMetadata(slug: RepoSlug): Promise<RepoMetadata> {
    const projectPath = encodeURIComponent(`${slug.owner}/${slug.repo}`);
    const data = await fetchJson<GitlabProjectData>(`${GITLAB_API_URL}/projects/${projectPath}`);
    return { ...EMPTY_REPO_METADATA, stars: data?.star_count ?? null };
}

async function fetchCodebergMetadata(slug: RepoSlug): Promise<RepoMetadata> {
    const data = await fetchJson<CodebergRepoData>(
        `${CODEBERG_API_URL}/repos/${slug.owner}/${slug.repo}`,
    );
    return { ...EMPTY_REPO_METADATA, stars: data?.stars_count ?? null };
}

const FETCHERS_BY_HOST: Record<string, RepoMetadataFetcher> = {
    [GITHUB_HOST]: fetchGithubMetadata,
    [GITLAB_HOST]: fetchGitlabMetadata,
    [CODEBERG_HOST]: fetchCodebergMetadata,
};

export async function fetchRepoMetadata(
    slug: RepoSlug,
    githubHeaders: HttpHeaders,
): Promise<RepoMetadata> {
    const fetcher = FETCHERS_BY_HOST[slug.host];
    if (!fetcher) {
        return EMPTY_REPO_METADATA;
    }
    return fetcher(slug, githubHeaders);
}
