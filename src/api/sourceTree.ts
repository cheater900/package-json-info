import { gunzip, parseTar } from "../utils/tarball";
import { buildFileTree, normalizePath } from "../utils/fileTree";
import type { FileTreeNode } from "../utils/fileTree";
import {
    fetchGithubTree,
    GITHUB_ENTRY_FOLDER,
    GITHUB_ENTRY_SUBMODULE,
    githubRawFileUrl,
} from "./github";
import { fetchWithTimeout } from "./http";
import { BYTES_PER_MB, MAX_FILE_TREE_ENTRIES, MAX_VIEWED_FILE_BYTES } from "../constants";
import { t } from "../i18n";
import type { SourceTreeRef } from "../types";

export type SourceTree = {
    tree: FileTreeNode[];
    /** True when part of the tree is missing: GitHub caps large repos, and the app lists at most MAX_FILE_TREE_ENTRIES. */
    truncated: boolean;
    /** Reads one file's content as text. GitHub fetches lazily, one file per call. */
    readFile: (path: string) => Promise<string>;
};

/** npm tarballs wrap every entry under a single top-level "package/" directory. */
const NPM_TARBALL_ROOT = /^package\//;

function assertViewableSize(bytes: number): void {
    if (bytes > MAX_VIEWED_FILE_BYTES) {
        throw new Error(
            t("errors.fileTooLarge", { megabytes: MAX_VIEWED_FILE_BYTES / BYTES_PER_MB }),
        );
    }
}

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
    const allEntries = parseTar(rawTar)
        .map((entry) => ({
            ...entry,
            path: normalizePath(entry.path.replace(NPM_TARBALL_ROOT, "")),
        }))
        .filter((entry) => entry.path !== "");
    const entries = allEntries.slice(0, MAX_FILE_TREE_ENTRIES);
    const contentByPath = new Map(
        entries.filter((e) => e.type === "file").map((e) => [e.path, e.content]),
    );
    return {
        tree: buildFileTree(entries),
        truncated: allEntries.length > MAX_FILE_TREE_ENTRIES,
        readFile: async (path) => {
            const content = contentByPath.get(path);
            if (!content) {
                throw new Error(t("errors.tarballFileMissing", { path }));
            }
            assertViewableSize(content.length);
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
    const githubTree = await fetchGithubTree(owner, repo, tag);
    const allEntries = githubTree.entries
        .filter((entry) => entry.type !== GITHUB_ENTRY_SUBMODULE)
        .map((entry) => ({
            path: entry.path,
            type: entry.type === GITHUB_ENTRY_FOLDER ? ("directory" as const) : ("file" as const),
            size: entry.size ?? 0,
        }));
    const entries = allEntries.slice(0, MAX_FILE_TREE_ENTRIES);
    const sizeByPath = new Map(entries.map((entry) => [entry.path, entry.size]));
    return {
        tree: buildFileTree(entries),
        truncated: githubTree.truncated || allEntries.length > MAX_FILE_TREE_ENTRIES,
        readFile: async (path) => {
            assertViewableSize(sizeByPath.get(path) ?? 0);
            const fileResponse = await fetchWithTimeout(
                githubRawFileUrl(owner, repo, encodedTag, path),
            );
            if (!fileResponse.ok) {
                throw new Error(t("errors.fileContentFetch", { status: fileResponse.status }));
            }
            return fileResponse.text();
        },
    };
}
