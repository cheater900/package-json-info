import { z } from "zod";
import {
    MAX_WORKSPACE_DIRS,
    MAX_WORKSPACE_MATCH_STEPS,
    MAX_WORKSPACE_PATTERN_LENGTH,
    MAX_WORKSPACE_PATTERNS,
    PACKAGE_JSON_FILE,
} from "../constants";

const PatternListSchema = z.array(z.string());

/** `workspaces` as npm/yarn/bun write it: a pattern list, or `{ packages: [...] }`. */
const WorkspacePatternsSchema = z
    .object({
        workspaces: z.union([
            PatternListSchema,
            z.object({ packages: PatternListSchema }).transform((value) => value.packages),
        ]),
    })
    .transform((value) => value.workspaces)
    .catch([]);

/** A GitHub repository at one branch. */
export type RepoRef = {
    owner: string;
    repo: string;
    branch: string;
};

/** The workspaces of a monorepo, and which one a loaded package.json belongs to. */
export type WorkspaceContext = {
    repo: RepoRef;
    /** Workspace folders, relative to the repo root. */
    paths: string[];
    /** Folder of the loaded package.json; WORKSPACE_ROOT for the repo root. */
    current: string;
    /** True when the repo tree was cut short, so `paths` may be incomplete. */
    truncated: boolean;
    /** True when the workspaces could not be listed. */
    failed: boolean;
};

/** Workspace folders found in a repo tree. */
export type WorkspaceDirs = {
    dirs: string[];
    /** True when a cap stopped the matching, so `dirs` may be incomplete. */
    truncated: boolean;
};

/** Characters of one folder name. */
type GlobSegment = string[];

/** Matching steps left; shared by every match of one listing. */
type MatchBudget = {
    steps: number;
};

export const WORKSPACE_ROOT = "";

const PACKAGE_JSON_SUFFIX = `/${PACKAGE_JSON_FILE}`;
const NEGATION_PREFIX = "!";
const GLOBSTAR = "**";
const WILDCARD = "*";
const NODE_MODULES_DIR = "node_modules";
const LEADING_DOT_SLASH = /^\.\//;
const TRAILING_SLASHES = /\/+$/;
const PNPM_PACKAGES_KEY = /^packages\s*:/;
const PNPM_LIST_ITEM = /^\s*-\s+(.*)$/;
const YAML_COMMENT = /(^|\s)#.*$/;
const SURROUNDING_QUOTES = /^(['"])(.*)\1$/;

/** Workspace patterns a package.json declares; a missing or malformed field reads as none. */
export function workspacePatternsOf(pkg: unknown): string[] {
    return WorkspacePatternsSchema.parse(pkg);
}

function unquote(value: string): string {
    return value.trim().replace(SURROUNDING_QUOTES, "$2");
}

/**
 * Reads the top-level `packages` list of a pnpm-workspace.yaml, written as
 * a block list (`- "a/*"`) or a flow list (`["a/*"]`). Not a YAML parser:
 * every other key is ignored.
 */
export function parsePnpmWorkspacePatterns(yaml: string): string[] {
    const lines = yaml.split(/\r?\n/).map((line) => line.replace(YAML_COMMENT, ""));
    const keyIndex = lines.findIndex((line) => PNPM_PACKAGES_KEY.test(line));
    if (keyIndex === -1) {
        return [];
    }
    const inlineValue = lines[keyIndex].replace(PNPM_PACKAGES_KEY, "").trim();
    if (inlineValue.startsWith("[")) {
        const flow = lines.slice(keyIndex).join(" ");
        const closing = flow.indexOf("]");
        // An unclosed list is invalid YAML; reading on would take text of later keys.
        if (closing === -1) {
            return [];
        }
        return flow
            .slice(flow.indexOf("[") + 1, closing)
            .split(",")
            .map(unquote)
            .filter(Boolean);
    }
    const patterns: string[] = [];
    for (const line of lines.slice(keyIndex + 1)) {
        if (line.trim() === "") {
            continue;
        }
        const item = line.match(PNPM_LIST_ITEM);
        if (!item) {
            break;
        }
        patterns.push(unquote(item[1]));
    }
    return patterns;
}

/**
 * Wildcard match with one backtrack point, so the work stays within
 * pattern length x input length whatever the pattern. A star matches any
 * run of input items, every other pattern item exactly one. Each step
 * draws on `budget`; a spent budget reads as "no match".
 */
function matchesWildcard<P, I>(
    pattern: readonly P[],
    input: readonly I[],
    isStar: (item: P) => boolean,
    matchesItem: (patternItem: P, inputItem: I) => boolean,
    budget: MatchBudget,
): boolean {
    let patternIndex = 0;
    let inputIndex = 0;
    let starIndex = -1;
    let starInputIndex = 0;
    // The call itself costs one step, so matching empty input is not free.
    budget.steps--;
    while (inputIndex < input.length) {
        if (--budget.steps < 0) {
            return false;
        }
        if (patternIndex < pattern.length && isStar(pattern[patternIndex])) {
            starIndex = patternIndex++;
            starInputIndex = inputIndex;
            continue;
        }
        if (
            patternIndex < pattern.length &&
            matchesItem(pattern[patternIndex], input[inputIndex])
        ) {
            patternIndex++;
            inputIndex++;
            continue;
        }
        if (starIndex === -1) {
            return false;
        }
        patternIndex = starIndex + 1;
        inputIndex = ++starInputIndex;
    }
    while (patternIndex < pattern.length && isStar(pattern[patternIndex])) {
        patternIndex++;
    }
    return patternIndex === pattern.length;
}

/** `*` matches within one folder name, a `**` segment any number of folders. */
function matchesGlob(pattern: GlobSegment[], dir: GlobSegment[], budget: MatchBudget): boolean {
    return matchesWildcard(
        pattern,
        dir,
        isGlobstar,
        (patternSegment, segment) =>
            matchesWildcard(
                patternSegment,
                segment,
                (char) => char === WILDCARD,
                (a, b) => a === b,
                budget,
            ),
        budget,
    );
}

function isGlobstar(segment: GlobSegment): boolean {
    return segment.length === GLOBSTAR.length && segment.every((char) => char === WILDCARD);
}

/** Folder names of a path, each as its characters, so matching allocates nothing. */
function toSegments(path: string): GlobSegment[] {
    return path.split("/").map((segment) => [...segment]);
}

/** Drops "./" and a trailing "/", so "./packages/*\/" matches "packages/a"; splits into folders. */
function patternSegments(pattern: string): GlobSegment[] {
    return toSegments(pattern.replace(LEADING_DOT_SLASH, "").replace(TRAILING_SLASHES, ""));
}

/**
 * Folders among `filePaths` that hold a package.json and match the
 * workspace `patterns`. A pattern starting with "!" excludes. Folders
 * under node_modules never count. Brace sets (`{a,b}`) are not expanded.
 * Patterns and paths come from the loaded repository, so the matching
 * work and the list length are capped; `truncated` tells when a cap cut
 * the list short.
 */
export function matchWorkspaceDirs(patterns: string[], filePaths: string[]): WorkspaceDirs {
    const usable = patterns
        .filter((pattern) => pattern.length <= MAX_WORKSPACE_PATTERN_LENGTH)
        .slice(0, MAX_WORKSPACE_PATTERNS);
    const included = usable
        .filter((pattern) => !pattern.startsWith(NEGATION_PREFIX))
        .map(patternSegments);
    const excluded = usable
        .filter((pattern) => pattern.startsWith(NEGATION_PREFIX))
        .map((pattern) => patternSegments(pattern.slice(NEGATION_PREFIX.length)));
    const budget: MatchBudget = { steps: MAX_WORKSPACE_MATCH_STEPS };
    const dirs: string[] = [];
    let truncated = false;
    for (const path of filePaths) {
        if (!path.endsWith(PACKAGE_JSON_SUFFIX)) {
            continue;
        }
        const dir = path.slice(0, -PACKAGE_JSON_SUFFIX.length);
        const segments = toSegments(dir);
        const isWorkspace =
            !dir.split("/").includes(NODE_MODULES_DIR) &&
            included.some((pattern) => matchesGlob(pattern, segments, budget)) &&
            !excluded.some((pattern) => matchesGlob(pattern, segments, budget));
        truncated = budget.steps < 0 || (isWorkspace && dirs.length === MAX_WORKSPACE_DIRS);
        if (truncated) {
            break;
        }
        if (isWorkspace) {
            dirs.push(dir);
        }
    }
    return { dirs: dirs.sort(), truncated };
}
