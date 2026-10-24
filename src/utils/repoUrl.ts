import { SUPPORTED_REPO_HOSTS } from "../constants";

/** A parsed `{ host, owner, repo }` reference to a source code repository. */
export type RepoSlug = {
    host: string;
    owner: string;
    repo: string;
};

const HOST_SLUG_PATTERNS = SUPPORTED_REPO_HOSTS.map((host) => ({
    host,
    // Host must start the string or follow "/", "@" or "." so "notgithub.com" never matches.
    // Owner and repo are limited to the characters the hosts allow in names, so
    // registry data can't inject query params or "../" into API URLs built from them.
    // A ".git" suffix is dropped even when a "#ref" or path follows it.
    pattern: new RegExp(
        `(?:^|[/@.])${host.replace(/\./g, "\\.")}/([\\w.-]+)/([\\w.-]+?)(?:\\.git)?(?=[/?#\\s]|$)`,
        "i",
    ),
}));

/** "." or "..": resolves to a parent path instead of naming an owner or repo. */
const DOT_SEGMENT = /^\.{1,2}$/;

/** Rewrites git+https://, git:// and ssh://git@ repository URLs to plain https, dropping `.git`. */
export function normaliseRepoUrl(raw: string | undefined): string | null {
    if (!raw) {
        return null;
    }
    return raw
        .replace(/^git\+/, "")
        .replace(/^git:\/\//, "https://")
        .replace(/^ssh:\/\/git@/, "https://")
        .replace(/\.git$/, "");
}

/**
 * Parses a slug for any SUPPORTED_REPO_HOSTS out of a git URL or shorthand:
 * git+https://, git://, ssh://git@, git@host:owner/repo, github:owner/repo.
 */
export function parseRepoSlug(raw: string): RepoSlug | null {
    const normalised = normaliseRepoUrl(raw)
        ?.replace(/^git@([^:]+):/, "https://$1/")
        .replace(/^github:/, "https://github.com/");
    if (!normalised) {
        return null;
    }
    for (const { host, pattern } of HOST_SLUG_PATTERNS) {
        const match = normalised.match(pattern);
        if (match && !DOT_SEGMENT.test(match[1]) && !DOT_SEGMENT.test(match[2])) {
            return { host, owner: match[1], repo: match[2] };
        }
    }
    return null;
}

export function repoWebUrl(slug: RepoSlug): string {
    return `https://${slug.host}/${slug.owner}/${slug.repo}`;
}

export function repoSlugKey(slug: RepoSlug): string {
    return `${slug.host}/${slug.owner}/${slug.repo}`;
}
