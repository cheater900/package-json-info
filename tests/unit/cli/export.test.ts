import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EXIT_BAD_ARGUMENTS, EXIT_LOAD_FAILURE, EXIT_OK, run } from "../../../src/cli/run";
import { clearPackageInfoCache } from "../../../src/core/api/npmPackage";
import { EXPORTERS } from "../../../src/core/export";
import { stubFetchByUrl } from "../../helpers/fetchMock";

const REGISTRY_LEFT_PAD = {
    "dist-tags": { latest: "1.3.0" },
    time: {},
    versions: { "1.3.0": { name: "left-pad", version: "1.3.0" } },
};

let tempDir: string;
let sourcePath: string;
const originalCwd = process.cwd();

async function runCli(...argv: string[]) {
    let stdout = "";
    let stderr = "";
    const code = await run(argv, {
        stdout: (text) => {
            stdout += text;
        },
        stderr: (text) => {
            stderr += text;
        },
    });
    return { code, stdout, stderr };
}

beforeEach(async () => {
    clearPackageInfoCache();
    stubFetchByUrl({ "registry.npmjs.org/left-pad": REGISTRY_LEFT_PAD });
    tempDir = await mkdtemp(join(tmpdir(), "package-json-info-cli-"));
    sourcePath = join(tempDir, "source.json");
    await writeFile(
        sourcePath,
        JSON.stringify({ name: "app", dependencies: { "left-pad": "1.3.0" } }),
    );
    process.chdir(tempDir);
});

afterEach(async () => {
    process.chdir(originalCwd);
    await rm(tempDir, { recursive: true, force: true });
});

describe("--format", () => {
    it.each(EXPORTERS.map((exporter) => exporter.id))("writes non-empty %s file", async (id) => {
        const target = join(tempDir, `out-${id}`);

        const result = await runCli(sourcePath, "--format", id, "--output", target);

        expect(result).toEqual({ code: EXIT_OK, stdout: "", stderr: `${target}\n` });
        expect((await stat(target)).size).toBeGreaterThan(0);
    });

    it("writes default file name into cwd", async () => {
        const result = await runCli(sourcePath, "--format", "csv");

        expect(result.code).toBe(EXIT_OK);
        expect(result.stderr).toBe("app-dependencies.csv\n");
        expect(await readdir(tempDir)).toContain("app-dependencies.csv");
    });

    it("exits 2 for unknown format listing valid ids", async () => {
        const result = await runCli(sourcePath, "--format", "bogus");

        expect(result.code).toBe(EXIT_BAD_ARGUMENTS);
        expect(result.stderr).toContain("Unknown format");
        expect(result.stderr).toContain("csv, xlsx, markdown, html, pdf");
    });

    it("exits 1 for unwritable output", async () => {
        const result = await runCli(sourcePath, "--format", "csv", "--output", tempDir);

        expect(result.code).toBe(EXIT_LOAD_FAILURE);
        expect(result.stderr).not.toBe("");
    });
});

describe("--report", () => {
    it("prints Markdown report to stdout", async () => {
        const result = await runCli(sourcePath, "--report", "md");

        expect(result.code).toBe(EXIT_OK);
        expect(result.stdout).toMatch(/^# /);
        expect(result.stdout).toContain("left-pad");
        expect(result.stderr).toBe("");
    });

    it("writes pdf report to --output", async () => {
        const target = join(tempDir, "report.pdf");

        const result = await runCli(sourcePath, "--report", "pdf", "--output", target);

        expect(result.code).toBe(EXIT_OK);
        expect((await readFile(target)).subarray(0, 4).toString()).toBe("%PDF");
    });

    it("writes pdf report default file name", async () => {
        const result = await runCli(sourcePath, "--report", "pdf");

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
        const result = await runCli(sourcePath, ...flags);

        expect(result.code).toBe(EXIT_BAD_ARGUMENTS);
        expect(result.stdout).toBe("");
    });
});
