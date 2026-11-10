import { mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFileLookupStore, defaultLookupCacheDir } from "../../../src/cli/fileLookupStore";

let tempDir: string;

beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "file-lookup-store-"));
});

afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
});

describe("createFileLookupStore", () => {
    it("round trips value", async () => {
        const store = createFileLookupStore(join(tempDir, "nested"));
        await store.save("registry", "left-pad", { a: 1 }, 0);
        const loaded = await store.load<{ a: number }>("registry", "left-pad");
        expect(loaded?.value).toEqual({ a: 1 });
        expect(Date.parse(loaded!.savedAt)).not.toBeNaN();
    });

    it("returns undefined for missing entry", async () => {
        expect(await createFileLookupStore(tempDir).load("registry", "nope")).toBeUndefined();
    });

    it("returns undefined for corrupt file", async () => {
        const store = createFileLookupStore(tempDir);
        await store.save("repoStars", "a/b", 5, 0);
        const [file] = await readdir(tempDir);
        await writeFile(join(tempDir, file), "{not json");
        expect(await store.load("repoStars", "a/b")).toBeUndefined();
    });

    it("keeps hostile key inside dir", async () => {
        const store = createFileLookupStore(tempDir);
        await store.save("registry", "../../evil", 1, 0);
        const files = await readdir(tempDir);
        expect(files).toHaveLength(1);
        expect(files[0]).toMatch(/^[0-9a-f]{64}\.json$/);
    });

    it("resolves save when dir is a file", async () => {
        const file = join(tempDir, "plain");
        await writeFile(file, "x");
        const store = createFileLookupStore(file);
        await expect(store.save("registry", "k", 1, 0)).resolves.toBeUndefined();
        expect(await store.load("registry", "k")).toBeUndefined();
    });

    it("creates owner-only dir + files", async () => {
        const dir = join(tempDir, "nested");
        await createFileLookupStore(dir).save("registry", "k", 1, 0);
        const [file] = await readdir(dir);
        expect((await stat(dir)).mode & 0o777).toBe(0o700);
        expect((await stat(join(dir, file))).mode & 0o777).toBe(0o600);
    });

    it("keeps generation 0", () => {
        expect(createFileLookupStore(tempDir).generation()).toBe(0);
    });
});

describe("defaultLookupCacheDir", () => {
    it("uses XDG_CACHE_HOME", () => {
        expect(defaultLookupCacheDir({ XDG_CACHE_HOME: "/x" })).toBe("/x/package-json-info");
    });

    it("falls back to home .cache", () => {
        expect(defaultLookupCacheDir({})).toBe(join(homedir(), ".cache", "package-json-info"));
    });
});
