import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bindCore } from "../../../src/cli/coreBinding";
import { EXIT_BAD_ARGUMENTS, EXIT_OK, run } from "../../../src/cli/run";
import { CORE_SETTINGS_DEFAULTS, coreRuntime } from "../../../src/core/runtime";
import "../../helpers/coreSetup";

const TOKEN = "ghp_secretToken123";

describe("bindCore", () => {
    it("uses defaults without flags or env", () => {
        expect(bindCore({}, {})).toEqual(CORE_SETTINGS_DEFAULTS);
    });

    it("reads env when flags absent", () => {
        const env = {
            PJI_PROXY_URL: "https://env.test/?u={url}",
            PJI_FETCH_TIMEOUT_MS: "111",
            PJI_FETCH_CONCURRENCY: "2",
        };

        expect(bindCore({}, env)).toEqual({
            proxyUrl: "https://env.test/?u={url}",
            fetchTimeoutMs: 111,
            fetchConcurrency: 2,
            githubToken: undefined,
        });
    });

    it("flags win over env", () => {
        const env = {
            PJI_PROXY_URL: "https://env.test/",
            PJI_FETCH_TIMEOUT_MS: "111",
            PJI_FETCH_CONCURRENCY: "2",
        };

        expect(
            bindCore({ proxyUrl: "https://flag.test/", timeout: "222", concurrency: "3" }, env),
        ).toMatchObject({
            proxyUrl: "https://flag.test/",
            fetchTimeoutMs: 222,
            fetchConcurrency: 3,
        });
    });

    it("warns + uses default for invalid int", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

        expect(bindCore({ timeout: "abc" }, { PJI_FETCH_TIMEOUT_MS: "111" })).toMatchObject({
            fetchTimeoutMs: CORE_SETTINGS_DEFAULTS.fetchTimeoutMs,
        });
        expect(warn).toHaveBeenCalledOnce();
    });

    it("returns error for env proxy URL with credentials", () => {
        expect(typeof bindCore({}, { PJI_PROXY_URL: "https://u:p@p.test/" })).toBe("string");
    });

    it("treats empty GITHUB_TOKEN as unset", () => {
        expect(bindCore({}, { GITHUB_TOKEN: "" })).toMatchObject({ githubToken: undefined });
    });

    it("warns naming env var for invalid env int", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

        expect(bindCore({}, { PJI_FETCH_CONCURRENCY: "0" })).toMatchObject({
            fetchConcurrency: CORE_SETTINGS_DEFAULTS.fetchConcurrency,
        });
        expect(warn.mock.calls[0][0]).toContain("PJI_FETCH_CONCURRENCY");
    });

    it("returns error for proxy URL with credentials", () => {
        expect(typeof bindCore({ proxyUrl: "https://u:p@p.test/" }, {})).toBe("string");
    });

    it("plugs settings into core", () => {
        bindCore({ timeout: "5" }, { GITHUB_TOKEN: TOKEN });

        expect(coreRuntime().settings()).toMatchObject({ fetchTimeoutMs: 5, githubToken: TOKEN });
    });

    it("plugs file lookup store by default", () => {
        bindCore({}, {});

        expect(coreRuntime().lookupStore).not.toBeNull();
    });

    it("plugs no lookup store for cache false", () => {
        bindCore({ cache: false }, {});

        expect(coreRuntime().lookupStore).toBeNull();
    });
});

describe("run binding", () => {
    let tempDir: string;
    let stderr: string;
    let source: string;

    const io = {
        stdout: () => {},
        stderr: (text: string) => {
            stderr += text;
        },
    };

    beforeEach(async () => {
        stderr = "";
        tempDir = await mkdtemp(join(tmpdir(), "package-json-info-bind-"));
        source = join(tempDir, "package.json");
        await writeFile(source, JSON.stringify({ name: "empty" }));
    });

    afterEach(async () => {
        await rm(tempDir, { recursive: true, force: true });
        vi.restoreAllMocks();
    });

    it("exits 2 for proxy URL with user:pass@", async () => {
        const code = await run([source, "--proxy-url", "https://u:p@p.test/"], io, {});

        expect(code).toBe(EXIT_BAD_ARGUMENTS);
        expect(stderr).not.toContain("u:p");
    });

    it("passes env token to core without printing it", async () => {
        const code = await run([source], io, { GITHUB_TOKEN: TOKEN });

        expect(code).toBe(EXIT_OK);
        expect(coreRuntime().settings().githubToken).toBe(TOKEN);
        expect(stderr).not.toContain(TOKEN);
    });

    it("applies flag over env", async () => {
        await run([source, "--concurrency", "7"], io, { PJI_FETCH_CONCURRENCY: "2" });

        expect(coreRuntime().settings().fetchConcurrency).toBe(7);
    });
});
