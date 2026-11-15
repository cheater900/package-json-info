import { execFileSync } from "node:child_process";
import { readdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultLookupCacheDir } from "../../../src/cli/fileLookupStore";
import { USAGE } from "../../../src/cli/options";
import { EXIT_BAD_ARGUMENTS, EXIT_LOAD_FAILURE, EXIT_OK } from "../../../src/cli/run";
import { clearPackageInfoCache } from "../../../src/core/api/npmPackage";
import { MAX_SOURCE_TEXT_BYTES } from "../../../src/core/constants";
import { coreRuntime } from "../../../src/core/runtime";
import { leftPadRegistryRoute } from "../../fixtures/dependencies";
import { createTempDir, runCli } from "../../helpers/cli";
import { countFetchCalls, stubFetchByUrl } from "../../helpers/fetchMock";

let tempDir: string;

async function writePackageJson(content: string) {
    const path = join(tempDir, "package.json");
    await writeFile(path, content);
    return path;
}

beforeEach(async () => {
    tempDir = await createTempDir();
});

describe("arguments", () => {
    it("prints usage for --help", async () => {
        expect(await runCli(["--help"])).toEqual({ code: EXIT_OK, stdout: USAGE, stderr: "" });
    });

    it("prints usage for -h", async () => {
        expect((await runCli(["-h"])).stdout).toBe(USAGE);
    });

    it("exits 2 without source", async () => {
        const result = await runCli([]);

        expect(result.code).toBe(EXIT_BAD_ARGUMENTS);
        expect(result.stderr).toContain("<source>");
        expect(result.stdout).toBe("");
    });

    it("exits 2 for two sources", async () => {
        expect((await runCli(["a", "b"])).code).toBe(EXIT_BAD_ARGUMENTS);
    });

    it("exits 2 for unknown flag", async () => {
        const result = await runCli(["package.json", "--bogus"]);

        expect(result.code).toBe(EXIT_BAD_ARGUMENTS);
        expect(result.stderr).toContain("--bogus");
    });
});

describe("source dispatch", () => {
    it("reads file path", async () => {
        const fetchMock = stubFetchByUrl({});
        const path = await writePackageJson('{"name":"local-app"}');

        const result = await runCli([path]);

        expect(result.code).toBe(EXIT_OK);
        expect(result.stdout).toMatch(/^# local-app\n/);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("reads file with UTF-8 BOM", async () => {
        stubFetchByUrl({});
        const path = await writePackageJson('\uFEFF{"name":"bom-app"}');

        const result = await runCli([path]);

        expect(result.code).toBe(EXIT_OK);
        expect(result.stdout).toMatch(/^# bom-app\n/);
    });

    it("reads package.json of dir path", async () => {
        const fetchMock = stubFetchByUrl({});
        await writePackageJson('{"name":"dir-app"}');

        const result = await runCli([tempDir]);

        expect(result.code).toBe(EXIT_OK);
        expect(result.stdout).toMatch(/^# dir-app\n/);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("exits 1 for dir without package.json", async () => {
        const fetchMock = stubFetchByUrl({});

        const result = await runCli([tempDir]);

        expect(result.code).toBe(EXIT_LOAD_FAILURE);
        expect(result.stderr).toContain("ENOENT");
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("reads named pipe path", async () => {
        const fetchMock = stubFetchByUrl({});
        const fifo = join(tempDir, "pipe");
        execFileSync("mkfifo", [fifo]);

        const [result] = await Promise.all([
            runCli([fifo]),
            writeFile(fifo, '{"name":"pipe-app"}'),
        ]);

        expect(result.code).toBe(EXIT_OK);
        expect(result.stdout).toMatch(/^# pipe-app\n/);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("fetches http URL", async () => {
        const fetchMock = stubFetchByUrl({
            "example.com/package.json": { name: "remote-app" },
        });

        const result = await runCli(["https://example.com/package.json"]);

        expect(result.stdout).toMatch(/^# remote-app\n/);
        expect(countFetchCalls(fetchMock, "example.com/package.json")).toBe(1);
    });

    it("fetches npm spec version from registry", async () => {
        stubFetchByUrl(leftPadRegistryRoute);

        const result = await runCli(["left-pad@1.2.0"]);

        expect(result.code).toBe(EXIT_OK);
        expect(result.stdout).toMatch(/^# left-pad\n/);
    });

    it("fetches latest for npm name without version", async () => {
        const fetchMock = stubFetchByUrl(leftPadRegistryRoute);

        expect((await runCli(["left-pad"])).code).toBe(EXIT_OK);
        expect(countFetchCalls(fetchMock, "registry.npmjs.org/left-pad")).toBe(1);
    });
});

describe("load failures", () => {
    it("exits 1 for unknown npm package", async () => {
        stubFetchByUrl({});

        const result = await runCli(["no-such-pkg"]);

        expect(result).toEqual({
            code: EXIT_LOAD_FAILURE,
            stdout: "",
            stderr: 'Could not find package.json data for "no-such-pkg".\n',
        });
    });

    it("exits 1 for URL 404", async () => {
        stubFetchByUrl({});

        const result = await runCli(["https://example.com/package.json"]);

        expect(result.code).toBe(EXIT_LOAD_FAILURE);
        expect(result.stderr).not.toBe("");
    });

    it("exits 1 for invalid JSON", async () => {
        const path = await writePackageJson("{not json");

        const result = await runCli([path]);

        expect(result.code).toBe(EXIT_LOAD_FAILURE);
        expect(result.stderr).toMatch(/^That's not valid JSON: /);
    });

    it("exits 1 for schema failure", async () => {
        const path = await writePackageJson('{"dependencies":["left-pad"]}');

        const result = await runCli([path]);

        expect(result.code).toBe(EXIT_LOAD_FAILURE);
        expect(result.stderr).toMatch(/^Invalid package\.json: dependencies: /);
    });

    it("exits 1 for package.json symlinked to /dev/zero", async () => {
        await symlink("/dev/zero", join(tempDir, "package.json"));

        const result = await runCli([tempDir]);

        expect(result).toEqual({
            code: EXIT_LOAD_FAILURE,
            stdout: "",
            stderr: "This package.json is larger than 10 MB, too large to load.\n",
        });
    });

    it("reads file of MAX_SOURCE_TEXT_BYTES", async () => {
        const json = '{"name":"big-app"}';
        const path = await writePackageJson(json.padEnd(MAX_SOURCE_TEXT_BYTES));

        const result = await runCli([path]);

        expect(result.code).toBe(EXIT_OK);
        expect(result.stdout).toMatch(/^# big-app\n/);
    });
});

describe("table output", () => {
    const PACKAGE_JSON = JSON.stringify({
        name: "app",
        dependencies: { "left-pad": "1.2.0" },
        devDependencies: { "dev-tool": "1.0.0" },
    });

    it("prints Deps + Dev Deps tables as Markdown", async () => {
        stubFetchByUrl(leftPadRegistryRoute);
        const path = await writePackageJson(PACKAGE_JSON);

        const { code, stdout } = await runCli([path]);
        const lines = stdout.split("\n");

        expect(code).toBe(EXIT_OK);
        expect(lines.slice(0, 4)).toEqual(["# app", "", "## Deps", ""]);
        expect(lines[4]).toMatch(/^\| Name \| Version \| /);
        expect(lines[6]).toMatch(/^\| left-pad \| 1\.2\.0 \| /);
        expect(stdout).toContain("## Dev Deps");
        expect(stdout).toMatch(/^\| dev-tool \| /m);
    });

    it("skips devDependencies for --no-dev", async () => {
        const fetchMock = stubFetchByUrl(leftPadRegistryRoute);
        const path = await writePackageJson(PACKAGE_JSON);

        const { stdout } = await runCli([path, "--no-dev"]);

        expect(stdout).not.toContain("## Dev Deps");
        expect(countFetchCalls(fetchMock, "dev-tool")).toBe(0);
    });

    it("strips terminal control chars from untrusted text", async () => {
        stubFetchByUrl(leftPadRegistryRoute);
        const path = await writePackageJson(
            JSON.stringify({ name: "a\u001b]52;c;cHduZWQ=\u0007b\u009bc\rd", dependencies: {} }),
        );

        const { stdout } = await runCli([path]);

        expect(stdout.split("\n")[0]).toBe("# a\\]52;c;cHduZWQ=bc d");
    });

    it("keeps tab + newline, strips DEL + C1 chars", async () => {
        stubFetchByUrl({});
        const path = await writePackageJson(
            JSON.stringify({ name: "a\tb\u007fc\u0085d\u009fe", dependencies: {} }),
        );

        const { stdout } = await runCli([path]);

        expect(stdout.split("\n")[0]).toBe("# a\tbcde");
    });

    it("strips terminal control chars from error output", async () => {
        stubFetchByUrl({});

        const { code, stderr } = await runCli(["no-such\u001b[2Jpkg"]);

        expect(code).toBe(EXIT_LOAD_FAILURE);
        expect(stderr).toBe('Could not find package.json data for "no-such[2Jpkg".\n');
    });

    it("prints default columns only + skips hidden column requests", async () => {
        const fetchMock = stubFetchByUrl(leftPadRegistryRoute);
        const path = await writePackageJson(PACKAGE_JSON);

        const { stdout } = await runCli([path]);

        expect(stdout).not.toContain("Vulnerabilities");
        expect(stdout).not.toContain("Bundle size");
        expect(countFetchCalls(fetchMock, "api.osv.dev")).toBe(0);
        expect(countFetchCalls(fetchMock, "bundlephobia.com")).toBe(0);
    });
});

describe("lookup cache", () => {
    const PACKAGE_JSON = JSON.stringify({ dependencies: { "left-pad": "^1.2.0" } });
    const cacheDir = () => defaultLookupCacheDir(process.env);

    // Core saves lookups without awaiting them, so files land after run resolves.
    const waitForStoredLookups = () =>
        vi.waitFor(async () => expect((await readdir(cacheDir())).length).toBeGreaterThan(0));

    it("stores lookups in XDG cache dir", async () => {
        stubFetchByUrl(leftPadRegistryRoute);
        const path = await writePackageJson(PACKAGE_JSON);

        await runCli([path]);

        await waitForStoredLookups();
    });

    it("plugs no lookup store for --no-cache", async () => {
        stubFetchByUrl(leftPadRegistryRoute);
        const path = await writePackageJson(PACKAGE_JSON);

        await runCli([path, "--no-cache"]);

        expect(coreRuntime().lookupStore).toBeNull();
    });

    it("serves stored lookup when network fails", async () => {
        stubFetchByUrl(leftPadRegistryRoute);
        const path = await writePackageJson(PACKAGE_JSON);
        await runCli([path]);
        await waitForStoredLookups();
        clearPackageInfoCache();
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));

        const { code, stdout } = await runCli([path]);

        expect(code).toBe(EXIT_OK);
        expect(stdout).toMatch(/^\| left-pad \| \^1\.2\.0 \| .*\| 1\.3\.0 \|/m);
        expect(stdout).not.toContain("offline");
    });
});
