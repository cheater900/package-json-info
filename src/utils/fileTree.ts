import { MAX_FILE_TREE_DEPTH } from "../constants";
import { t } from "../i18n";

export type FileTreeEntry = {
    path: string;
    type: "file" | "directory";
    size?: number;
};

export type FileTreeNode = {
    name: string;
    path: string;
    type: "file" | "directory";
    size: number;
    children?: FileTreeNode[];
};

type PathParts = {
    parentPath: string;
    name: string;
};

type HasEntryType = {
    type: FileTreeEntry["type"];
};

/**
 * Drops leading, trailing and repeated slashes ("a//b/" -> "a/b"), as tar
 * extraction does. Split, not regex: `/\/+$/` is O(n²) on a long inner
 * slash run, and each empty segment would nest one more directory.
 */
export function normalizePath(path: string): string {
    return path.split("/").filter(Boolean).join("/");
}

function splitPath(path: string): PathParts {
    const lastSlash = path.lastIndexOf("/");
    if (lastSlash === -1) {
        return { parentPath: "", name: path };
    }
    return { parentPath: path.slice(0, lastSlash), name: path.slice(lastSlash + 1) };
}

/** Directories before files, then by the given text key. */
function compareDirectoriesFirst<T extends HasEntryType>(
    a: T,
    b: T,
    textA: string,
    textB: string,
): number {
    if (a.type !== b.type) {
        return a.type === "directory" ? -1 : 1;
    }
    return textA.localeCompare(textB);
}

/**
 * Builds a nested file tree from a flat list of paths (as produced by a tar
 * archive or GitHub's recursive git-trees API). Intermediate directories
 * implied by a file's path but not present as their own entry are
 * synthesized on demand, since archives commonly only list directory
 * entries for genuinely empty directories. Throws when a path nests deeper
 * than MAX_FILE_TREE_DEPTH.
 */
export function buildFileTree(entries: readonly FileTreeEntry[]): FileTreeNode[] {
    const root: FileTreeNode = { name: "", path: "", type: "directory", size: 0, children: [] };
    const dirsByPath = new Map<string, FileTreeNode>([["", root]]);

    function ensureDir(path: string): FileTreeNode {
        const existing = dirsByPath.get(path);
        if (existing) {
            return existing;
        }
        const { parentPath, name } = splitPath(path);
        const parent = ensureDir(parentPath);
        const dir: FileTreeNode = { name, path, type: "directory", size: 0, children: [] };
        parent.children!.push(dir);
        dirsByPath.set(path, dir);
        return dir;
    }

    // Process directories before files so every parent exists by the time a
    // file needing it is inserted, regardless of the archive's own order.
    // Archives may list one path twice; like tar extraction, the last one wins.
    const uniqueEntries = [...new Map(entries.map((e) => [normalizePath(e.path), e])).values()];
    const sorted = uniqueEntries.sort((a, b) => compareDirectoriesFirst(a, b, a.path, b.path));
    for (const entry of sorted) {
        const path = normalizePath(entry.path);
        if (!path) {
            continue;
        }
        // ensureDir and sortTree recurse once per level; a crafted path with
        // tens of thousands of segments would overflow the call stack.
        if (path.split("/").length > MAX_FILE_TREE_DEPTH) {
            throw new Error(t("errors.treeTooDeep", { max: MAX_FILE_TREE_DEPTH }));
        }
        if (entry.type === "directory") {
            ensureDir(path);
            continue;
        }
        const { parentPath, name } = splitPath(path);
        ensureDir(parentPath).children!.push({
            name,
            path,
            type: "file",
            size: entry.size ?? 0,
        });
    }
    sortTree(root.children!);
    return root.children!;
}

/** Sorts every level of the tree: directories first, then by name. */
function sortTree(nodes: FileTreeNode[]): void {
    nodes.sort((a, b) => compareDirectoriesFirst(a, b, a.name, b.name));
    for (const node of nodes) {
        if (node.children) {
            sortTree(node.children);
        }
    }
}
