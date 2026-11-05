import { GITHUB_HOST } from "../constants";
import { isRepoHostUrl } from "../utils/repoUrl";
import type { PackageInput } from "../types";
import type { WorkspaceContext } from "../utils/workspaces";
import { fetchText } from "./http";
import { fetchPackageJsonForVersion } from "./npmPackage";
import { fetchPackageJsonFromRepo } from "./repoPackageJson";
import { fetchWorkspaceContext, fetchWorkspacePackageJson } from "./workspaces";

/** Package.json text, with the monorepo it came from when one is known. */
export type LoadedSource = {
    text: string;
    workspace?: WorkspaceContext | null;
};

/** Null when `text` resolves to null (not found). */
export async function asSource(text: Promise<string | null>): Promise<LoadedSource | null> {
    const resolved = await text;
    return resolved == null ? null : { text: resolved };
}

/** A repo's package.json; a GitHub repo-root one also gets its workspaces listed. */
async function fetchRepoSource(url: string): Promise<LoadedSource | null> {
    const found = await fetchPackageJsonFromRepo(url);
    if (!found) {
        return null;
    }
    if (found.slug.host !== GITHUB_HOST || found.branch === null) {
        return { text: found.text };
    }
    const repo = { owner: found.slug.owner, repo: found.slug.repo, branch: found.branch };
    return { text: found.text, workspace: await fetchWorkspaceContext(repo, found.text) };
}

/** Repo host URLs resolve to the repo's package.json; any other http(s) URL is fetched as-is. */
export function fetchUrlSource(url: string): Promise<LoadedSource | null> {
    return isRepoHostUrl(url) ? fetchRepoSource(url) : asSource(fetchText(url));
}

/** Published package.json of dependency `name` at the version `version` resolves to. */
export function fetchDependencySource({
    name,
    version,
}: PackageInput): Promise<LoadedSource | null> {
    return asSource(fetchPackageJsonForVersion(name, version));
}

/** Another workspace of the same monorepo; the workspace list carries over. */
export async function fetchWorkspaceSource(
    context: WorkspaceContext,
    path: string,
): Promise<LoadedSource> {
    return {
        text: await fetchWorkspacePackageJson(context.repo, path),
        workspace: { ...context, current: path },
    };
}
