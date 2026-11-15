import { PACKAGE_JSON_FILE, PNPM_WORKSPACE_FILE } from "../constants";
import { settle } from "../utils/settle";
import {
    matchWorkspaceDirs,
    parsePnpmWorkspacePatterns,
    workspacePatternsOf,
    WORKSPACE_ROOT,
} from "../utils/workspaces";
import type { RepoRef, WorkspaceContext } from "../utils/workspaces";
import { fetchGithubTree, GITHUB_ENTRY_FILE, githubRawFileUrl } from "./github";
import { fetchText, findFirstFound, readSourceText } from "./http";

/** Invalid JSON reads as "no package.json"; the loader reports the syntax error itself. */
function parseJsonOrNull(text: string): unknown {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

/** Patterns from the package.json `workspaces` field, else from pnpm-workspace.yaml. */
async function fetchWorkspacePatterns(repo: RepoRef, packageJsonText: string): Promise<string[]> {
    const declared = workspacePatternsOf(parseJsonOrNull(packageJsonText));
    if (declared.length > 0) {
        return declared;
    }
    const found = await findFirstFound([PNPM_WORKSPACE_FILE], (file) =>
        githubRawFileUrl(repo.owner, repo.repo, encodeURIComponent(repo.branch), file),
    );
    return found ? parsePnpmWorkspacePatterns(await readSourceText(found.response)) : [];
}

async function listWorkspaces(
    repo: RepoRef,
    packageJsonText: string,
): Promise<WorkspaceContext | null> {
    const patterns = await fetchWorkspacePatterns(repo, packageJsonText);
    if (patterns.length === 0) {
        return null;
    }
    const tree = await fetchGithubTree(repo.owner, repo.repo, repo.branch);
    const filePaths = tree.entries
        .filter((entry) => entry.type === GITHUB_ENTRY_FILE)
        .map((entry) => entry.path);
    const matched = matchWorkspaceDirs(patterns, filePaths);
    return {
        repo,
        paths: matched.dirs,
        current: WORKSPACE_ROOT,
        truncated: tree.truncated || matched.truncated,
        failed: false,
    };
}

/**
 * Lists the workspaces of a GitHub repo whose root package.json is
 * `packageJsonText`. The repo tree is requested only when workspace
 * patterns exist. Never throws: a failed lookup (rate limit, network)
 * gives a context with `failed` set, so the root package.json still loads.
 *
 * @returns null when the repo declares no workspaces.
 */
export async function fetchWorkspaceContext(
    repo: RepoRef,
    packageJsonText: string,
): Promise<WorkspaceContext | null> {
    const result = await settle(() => listWorkspaces(repo, packageJsonText));
    if (!result.ok) {
        return { repo, paths: [], current: WORKSPACE_ROOT, truncated: false, failed: true };
    }
    return result.value;
}

/**
 * Raw package.json text of one workspace folder, or of the repo root.
 * Throws when missing. The branch is encoded: one from a blob or tree URL
 * may hold "#" or "%".
 */
export function fetchWorkspacePackageJson(repo: RepoRef, path: string): Promise<string> {
    const filePath = path === WORKSPACE_ROOT ? PACKAGE_JSON_FILE : `${path}/${PACKAGE_JSON_FILE}`;
    return fetchText(
        githubRawFileUrl(repo.owner, repo.repo, encodeURIComponent(repo.branch), filePath),
    );
}
