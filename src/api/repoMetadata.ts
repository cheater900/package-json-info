import { z } from "zod";
import {
    CODEBERG_API_URL,
    CODEBERG_HOST,
    COMMIT_ACTIVITY_SAMPLE_SIZE,
    COMMIT_ACTIVITY_WINDOW_DAYS,
    GITHUB_API_URL,
    GITHUB_HOST,
    GITLAB_API_URL,
    GITLAB_HOST,
    HTTP_CONFLICT,
    HTTP_NOT_FOUND,
    MS_PER_DAY,
} from "../constants";
import type { RepoSlug } from "../utils/repoUrl";
import { githubRepoApiUrl } from "./github";
import { fetchJson, fetchWithTimeout, HttpError } from "./http";
import type { HttpHeaders, RequestSubject } from "./http";

/** GitHub documents `committer` and its `date` as optional. */
const GithubCommitsSchema = z.array(
    z.object({
        commit: z.object({
            committer: z.object({ date: z.string().optional() }).nullable(),
        }),
    }),
);

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

export type RepoCommitActivity = {
    lastCommitDate: string | null;
    commitsLastYear: number | null;
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

export const EMPTY_COMMIT_ACTIVITY: RepoCommitActivity = {
    lastCommitDate: null,
    commitsLastYear: null,
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

/**
 * Latest commit date and commit count (capped at COMMIT_ACTIVITY_SAMPLE_SIZE)
 * within COMMIT_ACTIVITY_WINDOW_DAYS via GitHub; other hosts have none.
 * An empty repo (HTTP 409) counts as zero commits. Throws on other failures.
 */
export async function fetchRepoCommitActivity(
    slug: RepoSlug,
    githubHeaders: HttpHeaders,
    subject: RequestSubject | null = null,
): Promise<RepoCommitActivity> {
    if (slug.host !== GITHUB_HOST) {
        return EMPTY_COMMIT_ACTIVITY;
    }
    const since = new Date(Date.now() - COMMIT_ACTIVITY_WINDOW_DAYS * MS_PER_DAY).toISOString();
    const url = `${githubRepoApiUrl(slug.owner, slug.repo)}/commits?since=${since}&per_page=${COMMIT_ACTIVITY_SAMPLE_SIZE}`;
    const response = await fetchWithTimeout(url, { headers: githubHeaders }, subject);
    if (response.status === HTTP_NOT_FOUND) {
        return EMPTY_COMMIT_ACTIVITY;
    }
    if (response.status === HTTP_CONFLICT) {
        return { lastCommitDate: null, commitsLastYear: 0 };
    }
    if (!response.ok) {
        throw new HttpError(response.status);
    }
    const commits = GithubCommitsSchema.parse(await response.json());
    // Newest first; a commit without committer date still counts.
    const dates = commits.flatMap(({ commit }) => commit.committer?.date ?? []);
    return {
        lastCommitDate: dates[0] ?? null,
        commitsLastYear: commits.length,
    };
}
