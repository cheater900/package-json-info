import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, vi } from "vitest";

// Fresh HOME + XDG_CACHE_HOME per test: CLI runs never write the real
// ~/.cache, and no test serves lookups an earlier test stored.
let home: string;

beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "package-json-info-home-"));
    vi.stubEnv("HOME", home);
    vi.stubEnv("XDG_CACHE_HOME", join(home, ".cache"));
});

afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(home, { recursive: true, force: true });
});
