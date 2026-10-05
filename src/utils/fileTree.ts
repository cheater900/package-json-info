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

function splitPath(path: string): { parentPath: string; name: string } {
    const lastSlash = path.lastIndexOf("/");
    if (lastSlash === -1) {
        return { parentPath: "", name: path };
    }
    return { parentPath: path.slice(0, lastSlash), name: path.slice(lastSlash + 1) };
}

/** Directories before files, then by the given text key. */
function compareDirectoriesFirst<T extends { type: string }>(
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
 * entries for genuinely empty directories.
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
    const sorted = [...entries].sort((a, b) => compareDirectoriesFirst(a, b, a.path, b.path));

    for (const entry of sorted) {
        const path = entry.path.replace(/\/+$/, "");
        if (!path) {
            continue;
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
