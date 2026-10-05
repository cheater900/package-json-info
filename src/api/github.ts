import { config } from "../config";
import { GITHUB_ACCEPT_HEADER, GITHUB_API_URL, GITHUB_RAW_URL } from "../constants";
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
 * "1.2.3". Checks each candidate via the refs API (one request, 404 when
 * absent) instead of listing every tag - popular repos have thousands.
 */
export async function findGithubReleaseTag(
    owner: string,
    repo: string,
    version: string,
    headers: HttpHeaders = githubHeaders(),
): Promise<string | null> {
    for (const candidate of [`v${version}`, version]) {
        const response = await fetch(
            `${githubRepoApiUrl(owner, repo)}/git/refs/tags/${encodeURIComponent(candidate)}`,
            { headers },
        );
        if (response.ok) {
            return candidate;
        }
    }
    return null;
}
