import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { onTestFinished } from "vitest";
import { run } from "../../src/cli/run";

/** Runs the CLI on `argv`; resolves to its exit code + everything it printed. */
export async function runCli(argv: string[], env: NodeJS.ProcessEnv = process.env) {
    let stdout = "";
    let stderr = "";
    const io = {
        stdout: (text: string) => {
            stdout += text;
        },
        stderr: (text: string) => {
            stderr += text;
        },
    };
    const code = await run(argv, io, env);
    return { code, stdout, stderr };
}

/** Fresh temp dir, removed once the current test finishes; call in a test or `beforeEach`. */
export async function createTempDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "package-json-info-test-"));
    onTestFinished(() => rm(dir, { recursive: true, force: true }));
    return dir;
}
