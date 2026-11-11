import { PACKAGE_JSON_FILE } from "../../src/constants";
import { WORKSPACE_ROOT } from "../../src/utils/workspaces";
import type { RepoRef, WorkspaceContext } from "../../src/utils/workspaces";

export const monorepoRef: RepoRef = { owner: "o", repo: "r", branch: "main" };

/** Root package.json text of a monorepo with npm-style workspaces. */
export const monorepoRootJson = JSON.stringify({ name: "mono-root", workspaces: ["packages/*"] });

/** Context of monorepoRef as loaded from its root, both workspaces listed. */
export const rootWorkspaceContext: WorkspaceContext = {
    repo: monorepoRef,
    paths: ["packages/a", "packages/b"],
    current: WORKSPACE_ROOT,
    truncated: false,
    failed: false,
};

/** GitHub git-trees answer body with a package.json in each of `dirs`. */
export function githubTreeBody(dirs: string[]) {
    return { tree: dirs.map((dir) => ({ path: `${dir}/${PACKAGE_JSON_FILE}`, type: "blob" })) };
}
