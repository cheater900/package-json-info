import {
    GITHUB_ACCEPT_HEADER,
    GITHUB_API_URL,
    GITHUB_RATE_LIMIT_URL,
    GITHUB_RAW_URL,
    HTTP_HEADER_AUTHORIZATION,
    HTTP_UNAUTHORIZED,
} from "../constants";
import { t } from "../i18n";
import { coreRuntime } from "../runtime";
import {
    bearerAuthorization,
    discardBody,
    fetchWithTimeout,
    findFirstFound,
    HttpError,
} from "./http";
import type { HttpHeaders, RequestSubject } from "./http";

export type GithubRateLimit = {
    limit: number;
    remaining: number;
};

type GithubRateLimitResponse = {
    rate: GithubRateLimit;
};

export type GithubTreeEntry = {
    path: string;
    type: typeof GITHUB_ENTRY_FILE | typeof GITHUB_ENTRY_FOLDER | typeof GITHUB_ENTRY_SUBMODULE;
    size?: number;
};

export type GithubTree = {
    entries: GithubTreeEntry[];
    /** True when GitHub cut the listing short; it caps very large repos. */
    truncated: boolean;
};

type GithubTreeResponse = {
    tree?: GithubTreeEntry[];
    truncated?: boolean;
};

/** Git-trees entry types. A submodule is a pointer to another repo, with no content here. */
export const GITHUB_ENTRY_FILE = "blob";
export const GITHUB_ENTRY_FOLDER = "tree";
export const GITHUB_ENTRY_SUBMODULE = "commit";

export function githubHeaders(
    token: string | undefined = coreRuntime().settings().githubToken,
): HttpHeaders {
    if (!token) {
        return { Accept: GITHUB_ACCEPT_HEADER };
    }
    return {
        Accept: GITHUB_ACCEPT_HEADER,
        [HTTP_HEADER_AUTHORIZATION]: bearerAuthorization(token),
    };
}

/**
 * Core API quota for `token`; this request doesn't count against it. Null
 * when GitHub rejects the token (401). Throws on other failures.
 */
export async function fetchGithubRateLimit(token: string): Promise<GithubRateLimit | null> {
    const response = await fetchWithTimeout(GITHUB_RATE_LIMIT_URL, {
        headers: githubHeaders(token),
    });
    if (response.status === HTTP_UNAUTHORIZED) {
        discardBody(response);
        return null;
    }
    if (!response.ok) {
        discardBody(response);
        throw new HttpError(response.status);
    }
    const { rate } = (await response.json()) as GithubRateLimitResponse;
    return { limit: rate.limit, remaining: rate.remaining };
}

export function githubRepoApiUrl(owner: string, repo: string): string {
    return `${GITHUB_API_URL}/repos/${owner}/${repo}`;
}

/** Raw file URL. `path` is URL-encoded folder by folder; `ref` goes in as given. */
export function githubRawFileUrl(owner: string, repo: string, ref: string, path: string): string {
    const encodedPath = path.split("/").map(encodeURIComponent).join("/");
    return `${GITHUB_RAW_URL}/${owner}/${repo}/${ref}/${encodedPath}`;
}

/**
 * Finds a release tag on GitHub matching `version`, trying "v1.2.3" then
 * "1.2.3". Checks each candidate via the single-ref API (one request, 404
 * when absent) instead of listing every tag - popular repos have thousands.
 * The plural `git/refs` endpoint is avoided: for a missing ref it returns
 * 200 with every ref sharing the prefix (v1.2.3 -> v1.2.30).
 * Throws on other failures (rate limit, network) so they aren't mistaken
 * for "no such tag".
 */
export async function findGithubReleaseTag(
    owner: string,
    repo: string,
    version: string,
    headers: HttpHeaders = githubHeaders(),
    subject: RequestSubject | null = null,
): Promise<string | null> {
    const found = await findFirstFound(
        [`v${version}`, version],
        (candidate) =>
            `${githubRepoApiUrl(owner, repo)}/git/ref/tags/${encodeURIComponent(candidate)}`,
        { headers },
        subject,
    );
    return found?.candidate ?? null;
}

/** Every file and folder of a repo at `ref` (branch, tag or commit), in one request. */
export async function fetchGithubTree(
    owner: string,
    repo: string,
    ref: string,
    subject: RequestSubject | null = null,
): Promise<GithubTree> {
    const response = await fetchWithTimeout(
        `${githubRepoApiUrl(owner, repo)}/git/trees/${encodeURIComponent(ref)}?recursive=1`,
        { headers: githubHeaders() },
        subject,
    );
    if (!response.ok) {
        discardBody(response);
        throw new Error(t("errors.repoTreeFetch", { status: response.status }));
    }
    const data = (await response.json()) as GithubTreeResponse;
    return { entries: data.tree ?? [], truncated: data.truncated === true };
}
