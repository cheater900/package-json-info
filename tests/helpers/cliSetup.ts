import { join } from "node:path";
import { afterEach, beforeEach, vi } from "vitest";
import { clearPackageInfoCache } from "../../src/core/api/npmPackage";
import { createTempDir } from "./cli";

// Fresh HOME + XDG_CACHE_HOME + in-memory lookups per test: CLI runs never
// write the real ~/.cache, and no test serves lookups an earlier test stored.
beforeEach(async () => {
    clearPackageInfoCache();
    const home = await createTempDir();
    vi.stubEnv("HOME", home);
    vi.stubEnv("XDG_CACHE_HOME", join(home, ".cache"));
});

afterEach(() => {
    vi.unstubAllEnvs();
});
