import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { bindCore } from "../../../src/cli/coreBinding";
import { EXIT_BAD_ARGUMENTS, EXIT_OK } from "../../../src/cli/run";
import { CORE_SETTINGS_DEFAULTS, coreRuntime } from "../../../src/core/runtime";
import { createTempDir, runCli } from "../../helpers/cli";

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
    let source: string;

    beforeEach(async () => {
        source = join(await createTempDir(), "package.json");
        await writeFile(source, JSON.stringify({ name: "empty" }));
    });

    it("exits 2 for proxy URL with user:pass@", async () => {
        const { code, stderr } = await runCli([source, "--proxy-url", "https://u:p@p.test/"], {});

        expect(code).toBe(EXIT_BAD_ARGUMENTS);
        expect(stderr).not.toContain("u:p");
    });

    it("passes env token to core without printing it", async () => {
        const { code, stderr } = await runCli([source], { GITHUB_TOKEN: TOKEN });

        expect(code).toBe(EXIT_OK);
        expect(coreRuntime().settings().githubToken).toBe(TOKEN);
        expect(stderr).not.toContain(TOKEN);
    });

    it("applies flag over env", async () => {
        await runCli([source, "--concurrency", "7"], { PJI_FETCH_CONCURRENCY: "2" });

        expect(coreRuntime().settings().fetchConcurrency).toBe(7);
    });
});
