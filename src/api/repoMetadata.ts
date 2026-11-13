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
import type { HttpHeaders, RequestSubject } from "./http";

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

export type RepoIssueCounts = {
    openPRs: number | null;
    closedPRs: number | null;
    openIssues: number | null;
    closedIssues: number | null;
};

type StarsFetcher = (
    slug: RepoSlug,
    githubHeaders: HttpHeaders,
    subject: RequestSubject | null,
) => Promise<number | null>;

export const EMPTY_ISSUE_COUNTS: RepoIssueCounts = {
    openPRs: null,
    closedPRs: null,
    openIssues: null,
    closedIssues: null,
};

const STARS_FETCHERS_BY_HOST: Record<string, StarsFetcher> = {
    [GITHUB_HOST]: async (slug, headers, subject) => {
        const data = await fetchJson<GithubRepoData>(
            githubRepoApiUrl(slug.owner, slug.repo),
            { headers },
            subject,
        );
        return data?.stargazers_count ?? null;
    },
    [GITLAB_HOST]: async (slug, _headers, subject) => {
        const projectPath = encodeURIComponent(`${slug.owner}/${slug.repo}`);
        const data = await fetchJson<GitlabProjectData>(
            `${GITLAB_API_URL}/projects/${projectPath}`,
            {},
            subject,
        );
        return data?.star_count ?? null;
    },
    [CODEBERG_HOST]: async (slug, _headers, subject) => {
        const data = await fetchJson<CodebergRepoData>(
            `${CODEBERG_API_URL}/repos/${slug.owner}/${slug.repo}`,
            {},
            subject,
        );
        return data?.stars_count ?? null;
    },
};

/** Star count from whichever supported host the repo lives on. Throws on request failure. */
export async function fetchRepoStars(
    slug: RepoSlug,
    githubHeaders: HttpHeaders,
    subject: RequestSubject | null = null,
): Promise<number | null> {
    const fetcher = STARS_FETCHERS_BY_HOST[slug.host];
    if (!fetcher) {
        return null;
    }
    return fetcher(slug, githubHeaders, subject);
}

/**
 * Open/closed PR and issue counts via GitHub search; other hosts have none.
 * Kept apart from stars because search has a much lower rate limit: a
 * throttled search must not cost the star count too. Throws on failure.
 */
export async function fetchRepoIssueCounts(
    slug: RepoSlug,
    githubHeaders: HttpHeaders,
    subject: RequestSubject | null = null,
): Promise<RepoIssueCounts> {
    if (slug.host !== GITHUB_HOST) {
        return EMPTY_ISSUE_COUNTS;
    }
    const countMatching = (filter: string) =>
        fetchJson<GithubSearchData>(
            `${GITHUB_API_URL}/search/issues?q=repo:${slug.owner}/${slug.repo}+${filter}&per_page=1`,
            { headers: githubHeaders },
            subject,
        ).then((data) => data?.total_count ?? null);
    const [openPRs, closedPRs, openIssues, closedIssues] = await Promise.all([
        countMatching("is:pr+is:open"),
        countMatching("is:pr+is:closed"),
        countMatching("is:issue+is:open"),
        countMatching("is:issue+is:closed"),
    ]);
    return { openPRs, closedPRs, openIssues, closedIssues };
}
