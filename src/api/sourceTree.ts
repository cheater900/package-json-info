import { gunzip, parseTar } from "../utils/tarball";
import { buildFileTree } from "../utils/fileTree";
import type { FileTreeNode } from "../utils/fileTree";
import { githubHeaders, githubRawFileUrl, githubRepoApiUrl } from "./github";

export type SourceTreeRef =
    | { provider: "npm"; tarballUrl: string }
    | { provider: "github"; owner: string; repo: string; tag: string };

export type SourceTree = {
    tree: FileTreeNode[];
    /** Reads one file's content as text. GitHub fetches lazily, one file per call. */
    readFile: (path: string) => Promise<string>;
};

type GithubTreeEntry = {
    path: string;
    type: "blob" | "tree";
    size?: number;
};

type GithubTreeResponse = {
    tree?: GithubTreeEntry[];
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

async function fetchGithubSourceTree(
    owner: string,
    repo: string,
    tag: string,
): Promise<SourceTree> {
    const encodedTag = encodeURIComponent(tag);
    const response = await fetch(
        `${githubRepoApiUrl(owner, repo)}/git/trees/${encodedTag}?recursive=1`,
        { headers: githubHeaders() },
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
                githubRawFileUrl(owner, repo, encodedTag, encodedPath),
            );
            if (!fileResponse.ok) {
                throw new Error(`Could not fetch file contents (status ${fileResponse.status}).`);
            }
            return fileResponse.text();
        },
    };
}
