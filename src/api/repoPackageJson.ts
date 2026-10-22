import {
    CODEBERG_HOST,
    DEFAULT_BRANCH_CANDIDATES,
    GITHUB_HOST,
    GITLAB_HOST,
    HTTP_NOT_FOUND,
    SUPPORTED_REPO_HOSTS,
} from "../constants";
import { t } from "../i18n";
import { parseRepoSlug } from "../utils/repoUrl";
import { githubRawFileUrl } from "./github";
import { fetchWithTimeout, HttpError } from "./http";

/** Builds the raw-file URL for a repo's root package.json on a branch. */
type RawUrlBuilder = (owner: string, repo: string, branch: string) => string;

const PACKAGE_JSON_PATH = "package.json";

const RAW_PACKAGE_JSON_URL_BUILDERS: Record<string, RawUrlBuilder> = {
    [GITHUB_HOST]: (owner, repo, branch) =>
        githubRawFileUrl(owner, repo, branch, PACKAGE_JSON_PATH),
    [GITLAB_HOST]: (owner, repo, branch) =>
        `https://${GITLAB_HOST}/${owner}/${repo}/-/raw/${branch}/${PACKAGE_JSON_PATH}`,
    [CODEBERG_HOST]: (owner, repo, branch) =>
        `https://${CODEBERG_HOST}/${owner}/${repo}/raw/branch/${branch}/${PACKAGE_JSON_PATH}`,
};

/**
 * True if `url`'s host is one of SUPPORTED_REPO_HOSTS. An unparseable URL
 * counts as "not a repo URL"; whichever fetch runs next reports the error.
 */
export function isRepoHostUrl(url: string): boolean {
    if (!URL.canParse(url)) {
        return false;
    }
    return SUPPORTED_REPO_HOSTS.includes(new URL(url).hostname);
}

/**
 * Fetches the raw package.json of a GitHub/GitLab/Codeberg repository,
 * trying each of DEFAULT_BRANCH_CANDIDATES in order. Only a 404 moves on
 * to the next branch; other failures throw.
 *
 * @returns The raw package.json text, or null if no branch has one.
 * @throws  If the URL isn't `https://<host>/<owner>/<repo>` on a supported host.
 */
export async function fetchPackageJsonFromRepo(repoUrl: string): Promise<string | null> {
    if (!URL.canParse(repoUrl)) {
        throw new Error(t("errors.invalidRepoUrl"));
    }
    const host = new URL(repoUrl).hostname;
    const buildRawUrl = RAW_PACKAGE_JSON_URL_BUILDERS[host];
    if (!buildRawUrl) {
        throw new Error(
            t("errors.unsupportedRepoHost", { host, hosts: SUPPORTED_REPO_HOSTS.join(", ") }),
        );
    }
    const slug = parseRepoSlug(repoUrl);
    if (!slug) {
        throw new Error(t("errors.invalidRepoUrl"));
    }
    for (const branch of DEFAULT_BRANCH_CANDIDATES) {
        const response = await fetchWithTimeout(buildRawUrl(slug.owner, slug.repo, branch));
        if (response.ok) {
            return response.text();
        }
        if (response.status !== HTTP_NOT_FOUND) {
            throw new HttpError(response.status);
        }
    }
    return null;
}
