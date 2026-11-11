import {
    CODEBERG_HOST,
    DEFAULT_BRANCH_CANDIDATES,
    PACKAGE_JSON_FILE,
    GITHUB_HOST,
    GITLAB_HOST,
    SUPPORTED_REPO_HOSTS,
} from "../constants";
import { t } from "../i18n";
import { parseRepoSlug, repoWebUrl } from "../utils/repoUrl";
import type { RepoSlug } from "../utils/repoUrl";
import { githubRawFileUrl } from "./github";
import { findFirstFound } from "./http";

/** A repo's root package.json, with where it was found. */
export type RepoPackageJson = {
    text: string;
    slug: RepoSlug;
    branch: string;
};

type RawPackageJsonUrlBuilder = (slug: RepoSlug, branch: string) => string;

const RAW_PACKAGE_JSON_URL_BUILDERS: Record<string, RawPackageJsonUrlBuilder> = {
    [GITHUB_HOST]: (slug, branch) =>
        githubRawFileUrl(slug.owner, slug.repo, branch, PACKAGE_JSON_FILE),
    [GITLAB_HOST]: (slug, branch) => `${repoWebUrl(slug)}/-/raw/${branch}/${PACKAGE_JSON_FILE}`,
    [CODEBERG_HOST]: (slug, branch) =>
        `${repoWebUrl(slug)}/raw/branch/${branch}/${PACKAGE_JSON_FILE}`,
};

/**
 * Fetches the raw package.json of a GitHub/GitLab/Codeberg repository,
 * trying each of DEFAULT_BRANCH_CANDIDATES in order. Only a 404 moves on
 * to the next branch; other failures throw.
 *
 * @returns The raw package.json text with its repo and branch, or null if no branch has one.
 * @throws  If the URL isn't `https://<host>/<owner>/<repo>` on a supported host.
 */
export async function fetchPackageJsonFromRepo(repoUrl: string): Promise<RepoPackageJson | null> {
    if (!URL.canParse(repoUrl)) {
        throw new Error(t("errors.invalidRepoUrl"));
    }
    const { hostname: host, origin, pathname } = new URL(repoUrl);
    const buildRawUrl = RAW_PACKAGE_JSON_URL_BUILDERS[host];
    if (!buildRawUrl) {
        throw new Error(
            t("errors.unsupportedRepoHost", { host, hosts: SUPPORTED_REPO_HOSTS.join(", ") }),
        );
    }
    // Slug from this host's path only: one in the query, hash or naming
    // another host would load a different repo than the URL shows.
    const slug = parseRepoSlug(`${origin}${pathname}`);
    if (slug?.host !== host) {
        throw new Error(t("errors.invalidRepoUrl"));
    }
    const found = await findFirstFound(DEFAULT_BRANCH_CANDIDATES, (branch) =>
        buildRawUrl(slug, branch),
    );
    if (!found) {
        return null;
    }
    return { text: await found.response.text(), slug, branch: found.candidate };
}
