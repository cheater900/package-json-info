import { describe, it, expect } from "vitest";
import {
    matchWorkspaceDirs,
    parsePnpmWorkspacePatterns,
    workspacePatternsOf,
} from "../../../src/utils/workspaces";
import {
    MAX_WORKSPACE_DIRS,
    MAX_WORKSPACE_PATTERN_LENGTH,
    MAX_WORKSPACE_PATTERNS,
} from "../../../src/constants";

// Wall-clock bounds are loose: the suite runs in parallel workers. Unbudgeted
// matching of these inputs takes minutes, so the bounds still catch it.
const BUDGET_STOP_MAX_MS = 10_000;
const BUDGET_STOP_TEST_TIMEOUT_MS = 15_000;

function matchDirs(patterns: string[], filePaths: string[]) {
    return matchWorkspaceDirs(patterns, filePaths).dirs;
}

function packageJsonPaths(dirs: string[]) {
    return dirs.map((dir) => `${dir}/package.json`);
}

describe("workspacePatternsOf", () => {
    it("reads array form", () => {
        expect(workspacePatternsOf({ workspaces: ["packages/*", "apps/web"] })).toEqual([
            "packages/*",
            "apps/web",
        ]);
    });

    it("reads { packages } form", () => {
        expect(workspacePatternsOf({ workspaces: { packages: ["packages/*"] } })).toEqual([
            "packages/*",
        ]);
    });

    it.each([
        ["missing field", { name: "x" }],
        ["string field", { workspaces: "packages/*" }],
        ["non-string items", { workspaces: [1, 2] }],
        ["object without packages", { workspaces: { nohoist: ["a"] } }],
        ["null document", null],
    ])("returns none for %s", (_case, pkg) => {
        expect(workspacePatternsOf(pkg)).toEqual([]);
    });
});

describe("parsePnpmWorkspacePatterns", () => {
    it("reads block list, strips quotes and comments", () => {
        const yaml = [
            "# workspace",
            "packages:",
            "  - 'packages/*' # libs",
            '  - "apps/**"',
            "",
            "  - docs",
            "  - '!**/test/**'",
            "catalog:",
            "  - not-a-package",
        ].join("\n");
        expect(parsePnpmWorkspacePatterns(yaml)).toEqual([
            "packages/*",
            "apps/**",
            "docs",
            "!**/test/**",
        ]);
    });

    it("reads list items at key indent, CRLF line ends", () => {
        expect(parsePnpmWorkspacePatterns("packages:\r\n- a/*\r\n- b\r\n")).toEqual(["a/*", "b"]);
    });

    it("reads flow list over several lines", () => {
        expect(parsePnpmWorkspacePatterns("packages: ['a/*',\n  \"b\"]\nother: 1")).toEqual([
            "a/*",
            "b",
        ]);
    });

    it("skips comment lines between items, comment after key", () => {
        const yaml = ["---", "packages: # folders", "  - a/*", "  # apps", "# top", "  - b"].join(
            "\n",
        );
        expect(parsePnpmWorkspacePatterns(yaml)).toEqual(["a/*", "b"]);
    });

    it("keeps # inside pattern without leading space", () => {
        expect(parsePnpmWorkspacePatterns("packages:\n  - 'a#b/*'\n")).toEqual(["a#b/*"]);
    });

    it.each([
        ["no packages key", "catalog:\n  vue: ^3.0.0"],
        ["nested packages key", "other:\n  packages:\n    - a"],
        ["empty file", ""],
        ["empty flow list", "packages: []\ncatalog:\n  - x"],
        ["key without items", "packages:\ncatalog:\n  - x"],
        ["flow list without closing bracket", "packages: ['a/*', 'b'\nother: 1"],
    ])("returns none for %s", (_case, yaml) => {
        expect(parsePnpmWorkspacePatterns(yaml)).toEqual([]);
    });
});

describe("matchWorkspaceDirs", () => {
    const files = [
        "package.json",
        "README.md",
        ...packageJsonPaths([
            "packages/b",
            "packages/a",
            "packages/a/fixtures/demo",
            "packages/a/node_modules/dep",
            "apps/web",
            "tools/cli",
            "playground/x/y",
        ]),
        "packages/c/index.js",
    ];

    it("* matches one folder level, result sorted", () => {
        expect(matchDirs(["packages/*"], files)).toEqual(["packages/a", "packages/b"]);
    });

    it("** matches any depth, never node_modules", () => {
        expect(matchDirs(["packages/**"], files)).toEqual([
            "packages/a",
            "packages/a/fixtures/demo",
            "packages/b",
        ]);
    });

    it("matches literal path, ignores ./ prefix and trailing slash", () => {
        expect(matchDirs(["./tools/cli/"], files)).toEqual(["tools/cli"]);
    });

    it("matches partial folder name wildcard", () => {
        expect(matchDirs(["*/w*b"], files)).toEqual(["apps/web"]);
    });

    it("** in pattern middle matches zero or more folders", () => {
        expect(matchDirs(["packages/**/a", "playground/**/y"], files)).toEqual([
            "packages/a",
            "playground/x/y",
        ]);
    });

    it.each([
        ["no patterns", []],
        ["only ! patterns", ["!packages/*"]],
    ])("returns none for %s", (_case, patterns) => {
        expect(matchWorkspaceDirs(patterns, files)).toEqual({ dirs: [], truncated: false });
    });

    it("! pattern excludes", () => {
        expect(matchDirs(["packages/**", "!**/fixtures/**"], files)).toEqual([
            "packages/a",
            "packages/b",
        ]);
    });

    it("never lists repo root or folder without package.json", () => {
        expect(matchDirs(["**", "packages/c"], files)).not.toContain("");
        expect(matchDirs(["packages/c"], files)).toEqual([]);
    });

    it("ignores pattern over length cap, patterns past count cap", () => {
        const longPattern = `${"a".repeat(MAX_WORKSPACE_PATTERN_LENGTH)}*`;
        const filler = Array.from({ length: MAX_WORKSPACE_PATTERNS }, () => "none/*");
        expect(matchDirs([longPattern, ...filler, "packages/*"], files)).toEqual([]);
    });

    it("matches star-heavy pattern against long path without stalling", () => {
        const pattern = "a*".repeat(MAX_WORKSPACE_PATTERN_LENGTH / 2 - 1) + "b";
        const dir = "a".repeat(5000);
        const start = performance.now();
        expect(matchDirs([pattern], packageJsonPaths([dir]))).toEqual([]);
        expect(performance.now() - start).toBeLessThan(1000);
    });

    it(
        "stops at step budget, flags truncated",
        () => {
            const segment = `*${"a".repeat(16)}b`;
            const patterns = Array.from(
                { length: MAX_WORKSPACE_PATTERNS },
                () => `**/${Array(10).fill(segment).join("/")}/z`,
            );
            const dir = Array(30)
                .fill(`${"a".repeat(120)}b`)
                .join("/");
            const dirs = Array.from({ length: 200 }, (_, index) => `${dir}/${index}`);
            const start = performance.now();
            const result = matchWorkspaceDirs(
                [...patterns, "packages/*"],
                packageJsonPaths([...dirs, "packages/a"]),
            );
            expect(result).toEqual({ dirs: [], truncated: true });
            expect(performance.now() - start).toBeLessThan(BUDGET_STOP_MAX_MS);
        },
        BUDGET_STOP_TEST_TIMEOUT_MS,
    );

    it("lists at most MAX_WORKSPACE_DIRS folders, flags truncated", () => {
        const dirs = Array.from({ length: MAX_WORKSPACE_DIRS + 1 }, (_, index) => `p/${index}`);
        const result = matchWorkspaceDirs(["p/*"], packageJsonPaths(dirs));
        expect(result.dirs).toHaveLength(MAX_WORKSPACE_DIRS);
        expect(result.truncated).toBe(true);
    });

    it("lists exactly MAX_WORKSPACE_DIRS folders unflagged", () => {
        const dirs = Array.from({ length: MAX_WORKSPACE_DIRS }, (_, index) => `p/${index}`);
        const result = matchWorkspaceDirs(["p/*"], packageJsonPaths(dirs));
        expect(result.dirs).toHaveLength(MAX_WORKSPACE_DIRS);
        expect(result.truncated).toBe(false);
    });

    it("reports full list as not truncated", () => {
        expect(matchWorkspaceDirs(["packages/*"], files).truncated).toBe(false);
    });
});
