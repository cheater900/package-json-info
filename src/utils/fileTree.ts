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
        if (existing) return existing;
        const lastSlash = path.lastIndexOf("/");
        const parentPath = lastSlash === -1 ? "" : path.slice(0, lastSlash);
        const name = lastSlash === -1 ? path : path.slice(lastSlash + 1);
        const parent = ensureDir(parentPath);
        const dir: FileTreeNode = { name, path, type: "directory", size: 0, children: [] };
        parent.children!.push(dir);
        dirsByPath.set(path, dir);
        return dir;
    }

    // Process directories before files so every parent exists by the time a
    // file needing it is inserted, regardless of the archive's own order.
    const sorted = [...entries].sort((a, b) => {
        if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
        return a.path.localeCompare(b.path);
    });

    for (const entry of sorted) {
        const path = entry.path.replace(/\/+$/, "");
        if (!path) continue;
        if (entry.type === "directory") {
            ensureDir(path);
            continue;
        }
        const lastSlash = path.lastIndexOf("/");
        const parentPath = lastSlash === -1 ? "" : path.slice(0, lastSlash);
        const name = lastSlash === -1 ? path : path.slice(lastSlash + 1);
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

/** Directories before files, alphabetically within each group - recursively. */
function sortTree(nodes: FileTreeNode[]): void {
    nodes.sort((a, b) => {
        if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
        return a.name.localeCompare(b.name);
    });
    for (const node of nodes) {
        if (node.children) sortTree(node.children);
    }
}
