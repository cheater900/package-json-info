import {
    CODEBERG_HOST,
    DEFAULT_BRANCH_CANDIDATES,
    PACKAGE_JSON_FILE,
    GITHUB_HOST,
    GITHUB_URL_VIEW_BLOB,
    GITHUB_URL_VIEW_TREE,
    GITLAB_HOST,
    SUPPORTED_REPO_HOSTS,
} from "../constants";
import { t } from "../i18n";
import { parseRepoSlug, repoWebUrl } from "../utils/repoUrl";
import type { RepoSlug } from "../utils/repoUrl";
import { githubRawFileUrl } from "./github";
import { findFirstFound, readSourceText } from "./http";

/** A repo's package.json, with where it was found. */
export type RepoPackageJson = {
    text: string;
    slug: RepoSlug;
    /** Ref whose root package.json this is; null when the file may sit deeper in the repo. */
    branch: string | null;
};

/** The file a GitHub `/blob/...` or `/tree/...` URL points at. */
type GithubFileTarget = {
    /** Ref and file path segments, unsplit: raw.githubusercontent.com resolves which is which. */
    refPath: string[];
    /** The ref when the file is surely the repo-root package.json, else null. */
    rootRef: string | null;
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
 * Decoded segments; null on bad percent-encoding or an encoded "/". URL
 * parsing already resolved "." / "..", %2e forms included, but "%2F.."
 * would decode into new ".." segments that climb out of the repo on the
 * raw host.
 */
function decodePathSegments(segments: string[]): string[] | null {
    let decoded: string[];
    try {
        decoded = segments.map((segment) => decodeURIComponent(segment));
    } catch {
        return null;
    }
    return decoded.some((segment) => segment.includes("/")) ? null : decoded;
}

/**
 * Target of a GitHub `/<owner>/<repo>/blob/<ref>/<path>` URL (that file)
 * or `/tree/<ref>/<path>` URL (that folder's package.json). Null for any
 * other path, which probes DEFAULT_BRANCH_CANDIDATES instead. A ref may
 * contain "/", so the file counts as repo root only when one segment is
 * left for the ref.
 *
 * @throws If the ref or path is missing or badly encoded.
 */
function githubFileTarget(pathname: string): GithubFileTarget | null {
    const [, , , view, ...rest] = pathname.split("/");
    if (view !== GITHUB_URL_VIEW_BLOB && view !== GITHUB_URL_VIEW_TREE) {
        return null;
    }
    const segments = decodePathSegments(rest.filter(Boolean));
    const minSegments = view === GITHUB_URL_VIEW_BLOB ? 2 : 1;
    if (!segments || segments.length < minSegments) {
        throw new Error(t("errors.invalidRepoUrl"));
    }
    if (view === GITHUB_URL_VIEW_TREE) {
        const rootRef = segments.length === 1 ? segments[0] : null;
        return { refPath: [...segments, PACKAGE_JSON_FILE], rootRef };
    }
    const isRootPackageJson = segments.length === 2 && segments[1] === PACKAGE_JSON_FILE;
    return { refPath: segments, rootRef: isRootPackageJson ? segments[0] : null };
}

async function fetchGithubFile(
    slug: RepoSlug,
    { refPath, rootRef }: GithubFileTarget,
): Promise<RepoPackageJson | null> {
    const [ref, ...path] = refPath;
    const url = githubRawFileUrl(slug.owner, slug.repo, encodeURIComponent(ref), path.join("/"));
    const found = await findFirstFound([url], (candidate) => candidate);
    if (!found) {
        return null;
    }
    return { text: await readSourceText(found.response), slug, branch: rootRef };
}

/**
 * Fetches the raw package.json of a GitHub/GitLab/Codeberg repository,
 * trying each of DEFAULT_BRANCH_CANDIDATES in order. Only a 404 moves on
 * to the next branch; other failures throw. A GitHub `/blob/` or `/tree/`
 * URL fetches the file it points at instead.
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
    const fileTarget = host === GITHUB_HOST ? githubFileTarget(pathname) : null;
    if (fileTarget) {
        return fetchGithubFile(slug, fileTarget);
    }
    const found = await findFirstFound(DEFAULT_BRANCH_CANDIDATES, (branch) =>
        buildRawUrl(slug, branch),
    );
    if (!found) {
        return null;
    }
    return { text: await readSourceText(found.response), slug, branch: found.candidate };
}
