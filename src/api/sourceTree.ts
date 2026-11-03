import { gunzip, parseTar } from "../utils/tarball";
import { buildFileTree, normalizePath } from "../utils/fileTree";
import type { FileTreeNode } from "../utils/fileTree";
import { githubHeaders, githubRawFileUrl, githubRepoApiUrl } from "./github";
import { fetchWithTimeout } from "./http";
import { t } from "../i18n";
import type { SourceTreeRef } from "../types";

export type SourceTree = {
    tree: FileTreeNode[];
    /** True when the host listed only part of the tree (GitHub caps large repos). */
    truncated: boolean;
    /** Reads one file's content as text. GitHub fetches lazily, one file per call. */
    readFile: (path: string) => Promise<string>;
};

type GithubTreeEntry = {
    path: string;
    type: "blob" | "tree" | typeof GITHUB_SUBMODULE_ENTRY_TYPE;
    size?: number;
};

type GithubTreeResponse = {
    tree?: GithubTreeEntry[];
    truncated?: boolean;
};

/** Git-trees entry type of a submodule: a pointer to another repo, with no content here. */
const GITHUB_SUBMODULE_ENTRY_TYPE = "commit";

/** npm tarballs wrap every entry under a single top-level "package/" directory. */
const NPM_TARBALL_ROOT = /^package\//;

export async function fetchSourceTree(ref: SourceTreeRef): Promise<SourceTree> {
    return ref.provider === "npm"
        ? fetchNpmSourceTree(ref.tarballUrl)
        : fetchGithubSourceTree(ref.owner, ref.repo, ref.tag);
}

async function fetchNpmSourceTree(tarballUrl: string): Promise<SourceTree> {
    const response = await fetchWithTimeout(tarballUrl);
    if (!response.ok) {
        throw new Error(t("errors.tarballDownload", { status: response.status }));
    }
    // 204/205 answers and some proxies succeed without a body.
    if (!response.body) {
        throw new Error(t("errors.tarballCorrupt"));
    }
    const rawTar = await gunzip(response.body);
    const entries = parseTar(rawTar)
        .map((entry) => ({
            ...entry,
            path: normalizePath(entry.path.replace(NPM_TARBALL_ROOT, "")),
        }))
        .filter((entry) => entry.path !== "");
    const contentByPath = new Map(
        entries.filter((e) => e.type === "file").map((e) => [e.path, e.content]),
    );
    return {
        tree: buildFileTree(entries),
        truncated: false,
        readFile: async (path) => {
            const content = contentByPath.get(path);
            if (!content) {
                throw new Error(t("errors.tarballFileMissing", { path }));
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
    const response = await fetchWithTimeout(
        `${githubRepoApiUrl(owner, repo)}/git/trees/${encodedTag}?recursive=1`,
        { headers: githubHeaders() },
    );
    if (!response.ok) {
        throw new Error(t("errors.repoTreeFetch", { status: response.status }));
    }
    const data = (await response.json()) as GithubTreeResponse;
    const entries = (data.tree ?? [])
        .filter((entry) => entry.type !== GITHUB_SUBMODULE_ENTRY_TYPE)
        .map((entry) => ({
            path: entry.path,
            type: entry.type === "tree" ? ("directory" as const) : ("file" as const),
            size: entry.size ?? 0,
        }));
    return {
        tree: buildFileTree(entries),
        truncated: data.truncated === true,
        readFile: async (path) => {
            const encodedPath = path.split("/").map(encodeURIComponent).join("/");
            const fileResponse = await fetchWithTimeout(
                githubRawFileUrl(owner, repo, encodedTag, encodedPath),
            );
            if (!fileResponse.ok) {
                throw new Error(t("errors.fileContentFetch", { status: fileResponse.status }));
            }
            return fileResponse.text();
        },
    };
}
