import { config } from "../config";
import { GITHUB_ACCEPT_HEADER, GITHUB_API_URL, GITHUB_RAW_URL } from "../constants";
import { findFirstFound } from "./http";
import type { HttpHeaders } from "./http";

export function githubHeaders(token: string | undefined = config.githubToken): HttpHeaders {
    if (!token) {
        return { Accept: GITHUB_ACCEPT_HEADER };
    }
    return { Accept: GITHUB_ACCEPT_HEADER, Authorization: `Bearer ${token}` };
}

export function githubRepoApiUrl(owner: string, repo: string): string {
    return `${GITHUB_API_URL}/repos/${owner}/${repo}`;
}

export function githubRawFileUrl(owner: string, repo: string, ref: string, path: string): string {
    return `${GITHUB_RAW_URL}/${owner}/${repo}/${ref}/${path}`;
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
): Promise<string | null> {
    const found = await findFirstFound(
        [`v${version}`, version],
        (candidate) =>
            `${githubRepoApiUrl(owner, repo)}/git/ref/tags/${encodeURIComponent(candidate)}`,
        { headers },
    );
    return found?.candidate ?? null;
}
