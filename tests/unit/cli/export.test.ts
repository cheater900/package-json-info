import { readFile, readdir, stat, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EXIT_BAD_ARGUMENTS, EXIT_LOAD_FAILURE, EXIT_OK } from "../../../src/cli/run";
import { EXPORTERS } from "../../../src/core/export";
import { leftPadRegistryRoute } from "../../fixtures/dependencies";
import { createTempDir, runCli } from "../../helpers/cli";
import { stubFetchByUrl } from "../../helpers/fetchMock";

const PACKAGE = { name: "app", dependencies: { "left-pad": "1.3.0" } };
const PACKAGE_WITH_DEV_DEPS = { ...PACKAGE, devDependencies: { "dev-tool": "1.0.0" } };

let tempDir: string;
let sourcePath: string;
const originalCwd = process.cwd();

beforeEach(async () => {
    stubFetchByUrl(leftPadRegistryRoute);
    tempDir = await createTempDir();
    sourcePath = join(tempDir, "source.json");
    await writeFile(sourcePath, JSON.stringify(PACKAGE));
    process.chdir(tempDir);
});

afterEach(() => {
    process.chdir(originalCwd);
});

describe("--format", () => {
    it.each(EXPORTERS.map((exporter) => exporter.id))("writes non-empty %s file", async (id) => {
        const target = join(tempDir, `out-${id}`);

        const result = await runCli([sourcePath, "--format", id, "--output", target]);

        expect(result).toEqual({
            code: EXIT_OK,
            stdout: "",
            stderr: `${target}\n`,
        });
        expect((await stat(target)).size).toBeGreaterThan(0);
    });

    it("writes default file name into cwd", async () => {
        const result = await runCli([sourcePath, "--format", "csv"]);

        expect(result.code).toBe(EXIT_OK);
        expect(result.stderr).toBe("app-dependencies.csv\n");
        expect(await readdir(tempDir)).toContain("app-dependencies.csv");
    });

    it("refuses symlink at default file name", async () => {
        const victim = join(tempDir, "victim.txt");
        await writeFile(victim, "keep");
        await symlink(victim, join(tempDir, "app-dependencies.csv"));

        const result = await runCli([sourcePath, "--format", "csv"]);

        expect(result.code).toBe(EXIT_LOAD_FAILURE);
        expect(await readFile(victim, "utf8")).toBe("keep");
    });

    it("refuses dangling symlink at default file name", async () => {
        const victim = join(tempDir, "victim.txt");
        await symlink(victim, join(tempDir, "app-dependencies.csv"));

        const result = await runCli([sourcePath, "--format", "csv"]);

        expect(result.code).toBe(EXIT_LOAD_FAILURE);
        expect(await readdir(tempDir)).not.toContain("victim.txt");
    });

    it("keeps hostile package name inside cwd", async () => {
        await writeFile(sourcePath, JSON.stringify({ name: "../../evil/name", dependencies: {} }));

        const result = await runCli([sourcePath, "--format", "csv"]);

        expect(result).toEqual({
            code: EXIT_OK,
            stdout: "",
            stderr: "evil-name-dependencies.csv\n",
        });
        expect(await readdir(tempDir)).toContain("evil-name-dependencies.csv");
    });

    it("names default file by package.json for unnamed package", async () => {
        await writeFile(sourcePath, JSON.stringify({ dependencies: {} }));

        const result = await runCli([sourcePath, "--format", "csv"]);

        expect(result.stderr).toBe("package-json-dependencies.csv\n");
    });

    it("skips devDependencies for --no-dev", async () => {
        await writeFile(sourcePath, JSON.stringify(PACKAGE_WITH_DEV_DEPS));
        const withDev = join(tempDir, "with.csv");
        const withoutDev = join(tempDir, "without.csv");

        await runCli([sourcePath, "--format", "csv", "--output", withDev]);
        await runCli([sourcePath, "--format", "csv", "--no-dev", "--output", withoutDev]);

        expect(await readFile(withDev, "utf8")).toContain("dev-tool");
        expect(await readFile(withoutDev, "utf8")).not.toContain("dev-tool");
    });

    it("overwrites existing default file", async () => {
        await writeFile(join(tempDir, "app-dependencies.csv"), "old");

        const result = await runCli([sourcePath, "--format", "csv"]);

        expect(result.code).toBe(EXIT_OK);
        expect(await readFile(join(tempDir, "app-dependencies.csv"), "utf8")).toContain("left-pad");
    });

    it("follows symlink given as --output", async () => {
        const target = join(tempDir, "target.csv");
        const link = join(tempDir, "link.csv");
        await writeFile(target, "");
        await symlink(target, link);

        const result = await runCli([sourcePath, "--format", "csv", "--output", link]);

        expect(result.code).toBe(EXIT_OK);
        expect(await readFile(target, "utf8")).toContain("left-pad");
    });

    it("exits 2 for unknown format listing valid ids", async () => {
        const result = await runCli([sourcePath, "--format", "bogus"]);

        expect(result.code).toBe(EXIT_BAD_ARGUMENTS);
        expect(result.stderr).toContain("Unknown format");
        expect(result.stderr).toContain("csv, xlsx, markdown, html, pdf");
    });

    it("exits 1 for unwritable output", async () => {
        const result = await runCli([sourcePath, "--format", "csv", "--output", tempDir]);

        expect(result.code).toBe(EXIT_LOAD_FAILURE);
        expect(result.stderr).not.toBe("");
    });
});

describe("--report", () => {
    it("prints Markdown report to stdout", async () => {
        const result = await runCli([sourcePath, "--report", "md"]);

        expect(result.code).toBe(EXIT_OK);
        expect(result.stdout).toMatch(/^# /);
        expect(result.stdout).toContain("left-pad");
        expect(result.stderr).toBe("");
    });

    it("skips devDependencies of Markdown report for --no-dev", async () => {
        await writeFile(sourcePath, JSON.stringify(PACKAGE_WITH_DEV_DEPS));

        const withDev = await runCli([sourcePath, "--report", "md"]);
        const withoutDev = await runCli([sourcePath, "--report", "md", "--no-dev"]);

        expect(withDev.stdout).toContain("dev-tool");
        expect(withoutDev.stdout).not.toContain("dev-tool");
        expect(withoutDev.stdout).toContain("left-pad");
    });

    it("writes pdf report to --output", async () => {
        const target = join(tempDir, "report.pdf");

        const result = await runCli([sourcePath, "--report", "pdf", "--output", target]);

        expect(result.code).toBe(EXIT_OK);
        expect((await readFile(target)).subarray(0, 4).toString()).toBe("%PDF");
    });

    it("refuses symlink at default pdf report name", async () => {
        const victim = join(tempDir, "victim.txt");
        await writeFile(victim, "keep");
        await symlink(victim, join(tempDir, "app-report.pdf"));

        const result = await runCli([sourcePath, "--report", "pdf"]);

        expect(result.code).toBe(EXIT_LOAD_FAILURE);
        expect(await readFile(victim, "utf8")).toBe("keep");
    });

    it("writes pdf report default file name", async () => {
        const result = await runCli([sourcePath, "--report", "pdf"]);

        expect(result.code).toBe(EXIT_OK);
        expect(result.stderr).toBe("app-report.pdf\n");
        expect(await readdir(tempDir)).toContain("app-report.pdf");
    });
});

describe("bad combinations", () => {
    it.each([
        [["--format", "csv", "--report", "md"]],
        [["--report", "html"]],
        [["--output", "x.csv"]],
        [["--report", "md", "--output", "x.md"]],
    ])("exits 2 for %j", async (flags) => {
        const result = await runCli([sourcePath, ...flags]);

        expect(result.code).toBe(EXIT_BAD_ARGUMENTS);
        expect(result.stdout).toBe("");
    });
});
