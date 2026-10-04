import { gunzip, parseTar } from "./tarball";
import { buildFileTree } from "./fileTree";
import type { FileTreeNode } from "./fileTree";

export type SourceTreeRef =
    | { provider: "npm"; tarballUrl: string }
    | { provider: "github"; owner: string; repo: string; tag: string };

export type SourceTree = {
    tree: FileTreeNode[];
    /** Reads one file's content, decoded as text. Fetches lazily for GitHub - never for every file up front. */
    readFile: (path: string) => Promise<string>;
};

/** npm tarballs wrap every entry under a single top-level "package/" directory. */
const NPM_TARBALL_ROOT = /^package\//;

export async function fetchSourceTree(ref: SourceTreeRef): Promise<SourceTree> {
    return ref.provider === "npm"
        ? fetchNpmSourceTree(ref.tarballUrl)
        : fetchGithubSourceTree(ref.owner, ref.repo, ref.tag);
}

async function fetchNpmSourceTree(tarballUrl: string): Promise<SourceTree> {
    const response = await fetch(tarballUrl);
    if (!response.ok) {
        throw new Error(`Could not download the package tarball (status ${response.status}).`);
    }
    const rawTar = await gunzip(await response.arrayBuffer());
    const entries = parseTar(rawTar)
        .map((entry) => ({ ...entry, path: entry.path.replace(NPM_TARBALL_ROOT, "") }))
        .filter((entry) => entry.path !== "");

    const contentByPath = new Map(
        entries.filter((e) => e.type === "file").map((e) => [e.path, e.content]),
    );

    return {
        tree: buildFileTree(entries),
        readFile: async (path) => {
            const content = contentByPath.get(path);
            if (!content) {
                throw new Error(`File not found in the downloaded tarball: ${path}`);
            }
            return new TextDecoder().decode(content);
        },
    };
}

type GithubTreeEntry = {
    path: string;
    type: "blob" | "tree";
    size?: number;
};

type GithubTreeResponse = {
    tree?: GithubTreeEntry[];
};

async function fetchGithubSourceTree(
    owner: string,
    repo: string,
    tag: string,
): Promise<SourceTree> {
    const response = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(tag)}?recursive=1`,
        { headers: { Accept: "application/vnd.github+json" } },
    );
    if (!response.ok) {
        throw new Error(`Could not fetch the repository tree (status ${response.status}).`);
    }
    const data = (await response.json()) as GithubTreeResponse;
    const entries = (data.tree ?? []).map((entry) => ({
        path: entry.path,
        type: entry.type === "tree" ? ("directory" as const) : ("file" as const),
        size: entry.size ?? 0,
    }));

    return {
        tree: buildFileTree(entries),
        readFile: async (path) => {
            const encodedPath = path.split("/").map(encodeURIComponent).join("/");
            const fileResponse = await fetch(
                `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(tag)}/${encodedPath}`,
            );
            if (!fileResponse.ok) {
                throw new Error(`Could not fetch file contents (status ${fileResponse.status}).`);
            }
            return fileResponse.text();
        },
    };
}

/**
 * Finds a release tag on GitHub matching `version`, trying the two
 * conventional naming patterns ("v1.2.3" then "1.2.3"). Checks each
 * candidate's existence directly via the refs API (a single request, 404 if
 * absent) rather than listing every tag - popular repos can have thousands.
 * Returns null if neither pattern matches.
 */
export async function findGithubReleaseTag(
    owner: string,
    repo: string,
    version: string,
    headers: Record<string, string> = {},
): Promise<string | null> {
    for (const candidate of [`v${version}`, version]) {
        const response = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/git/refs/tags/${encodeURIComponent(candidate)}`,
            { headers },
        );
        if (response.ok) {
            return candidate;
        }
    }
    return null;
}
