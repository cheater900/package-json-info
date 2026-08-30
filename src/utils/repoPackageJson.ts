/**
 * Builds the raw-file URL for a package.json on a given host, owner, repo,
 * and branch.
 */
type RawUrlBuilder = (owner: string, repo: string, branch: string) => string;

const REPO_HOST_RAW_URL_BUILDERS: Record<string, RawUrlBuilder> = {
    "github.com": (owner, repo, branch) =>
        `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/package.json`,
    "gitlab.com": (owner, repo, branch) =>
        `https://gitlab.com/${owner}/${repo}/-/raw/${branch}/package.json`,
    "codeberg.org": (owner, repo, branch) =>
        `https://codeberg.org/${owner}/${repo}/raw/branch/${branch}/package.json`,
};

export const SUPPORTED_REPO_HOSTS = Object.keys(REPO_HOST_RAW_URL_BUILDERS);

const REPO_URL_PATTERN = /^https:\/\/([^/]+)\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)(?:\/.*)?$/;

/**
 * True if `url`'s host is one of SUPPORTED_REPO_HOSTS - used to route a
 * single URL input between fetchPackageJsonFromRepo (a repo URL) and a
 * plain "fetch this URL as text" (any other URL). Never throws: an
 * unparseable URL is treated as "not a repo URL" rather than an error,
 * leaving that error to surface from whichever fetch actually runs.
 */
export function isRepoHostUrl(url: string): boolean {
    try {
        return SUPPORTED_REPO_HOSTS.includes(new URL(url).hostname);
    } catch {
        return false;
    }
}

const BRANCHES_TO_TRY = ["main", "master"];

/**
 * Fetches the raw package.json content for a GitHub/GitLab/Codeberg
 * repository URL, trying the "main" branch and falling back to "master".
 *
 * @returns The raw package.json text, or null if neither branch has one.
 * @throws  If the URL isn't a recognisable `https://<host>/<owner>/<repo>`
 *          URL, or the host isn't one of the supported ones.
 */
export async function fetchPackageJsonFromRepo(repoUrl: string): Promise<string | null> {
    const match = repoUrl.match(REPO_URL_PATTERN);
    if (!match) {
        throw new Error("Invalid repository URL. Must be in format: https://<host>/<owner>/<repo>");
    }

    const [, host, owner, repo] = match;
    const buildRawUrl = REPO_HOST_RAW_URL_BUILDERS[host];
    if (!buildRawUrl) {
        throw new Error(
            `Unsupported git host "${host}". Supported hosts: ${SUPPORTED_REPO_HOSTS.join(", ")}`,
        );
    }

    for (const branch of BRANCHES_TO_TRY) {
        const response = await fetch(buildRawUrl(owner, repo, branch));
        if (response.ok) {
            return response.text();
        }
    }
    return null;
}
