import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import {
    mockExternalApis,
    loadJson,
    expandAllSections,
    fetchFromUrlInput,
    hasStoredLookup,
} from "./helpers";
import { TOGGLEABLE_COLUMNS } from "../../src/utils/tableColumns";
import {
    BUNDLEPHOBIA_SIZE_URL,
    GITHUB_API_URL,
    GITHUB_RAW_URL,
    NPM_REGISTRY_URL,
    NPM_WEEKLY_DOWNLOADS_URL,
    OSV_QUERY_URL,
    SHARE_STEP_QUERY_PARAM,
} from "../../src/constants";
import { minimalRegistryDoc } from "../fixtures/dependencies";
import { githubTreeBody } from "../fixtures/workspaces";
import { buildNpmTarball } from "../fixtures/tarball";

test.beforeEach(async ({ page }) => {
    await mockExternalApis(page);
});

test("dependency table scrolls horizontally", async ({ page }) => {
    await page.goto("/");
    await expandAllSections(page);
    const depsTable = page.locator("table.deps-table").first();
    await expect(depsTable).toBeVisible();

    const overflowX = await depsTable.evaluate((el) => getComputedStyle(el).overflowX);
    expect(["scroll", "auto"]).toContain(overflowX);

    const { scrollWidth, clientWidth } = await depsTable.evaluate((el) => ({
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
    }));
    expect(scrollWidth).toBeGreaterThan(clientWidth);

    // A genuinely scrollable element accepts a scrollLeft up to its overflow
    // amount; a non-scrollable one clamps straight back to 0.
    const scrolledLeft = await depsTable.evaluate((el) => {
        el.scrollLeft = el.scrollWidth;
        return el.scrollLeft;
    });
    expect(scrolledLeft).toBeGreaterThan(0);
});

test("fetches package in both dependencies and devDependencies once", async ({ page }) => {
    let registryRequests = 0;
    await page.route(`${NPM_REGISTRY_URL}/shared-pkg`, async (route) => {
        registryRequests++;
        await route.fulfill({ json: minimalRegistryDoc });
    });

    await page.goto("/");
    await expandAllSections(page);
    await loadJson(page, {
        name: "demo",
        dependencies: { "shared-pkg": "1.0.0" },
        devDependencies: { "shared-pkg": "1.0.0" },
    });

    // Both tables render their own row for the package; once both are up,
    // both watchers' fetches have settled.
    await expect(page.getByRole("cell", { name: "shared-pkg", exact: true })).toHaveCount(2);

    expect(registryRequests).toBe(1);
});

test("hides Vulnerabilities, Bundle size, Maintainers by default, skips third-party services on fresh load", async ({
    page,
}) => {
    let osvRequests = 0;
    let bundlephobiaRequests = 0;
    await page.route(OSV_QUERY_URL, async (route) => {
        osvRequests++;
        await route.fulfill({ json: { vulns: [] } });
    });
    await page.route(`${BUNDLEPHOBIA_SIZE_URL}**`, async (route) => {
        bundlephobiaRequests++;
        await route.fulfill({ json: { gzip: 1 } });
    });

    await page.goto("/");
    await expandAllSections(page);
    const depsTable = page.locator("table.deps-table").first();
    await expect(depsTable.getByRole("cell", { name: "vue", exact: true })).toBeVisible();

    await expect(depsTable.getByRole("columnheader", { name: "Vulnerabilities" })).toHaveCount(0);
    await expect(depsTable.getByRole("columnheader", { name: "Bundle size (gzip)" })).toHaveCount(
        0,
    );
    await expect(depsTable.getByRole("columnheader", { name: "Maintainers" })).toHaveCount(0);
    expect(await page.getByLabel("Vulnerabilities", { exact: true }).isChecked()).toBe(false);
    expect(await page.getByLabel("Bundle size (gzip)", { exact: true }).isChecked()).toBe(false);
    expect(await page.getByLabel("Maintainers", { exact: true }).isChecked()).toBe(false);

    expect(osvRequests).toBe(0);
    expect(bundlephobiaRequests).toBe(0);

    // The npm registry and repo-host columns, in contrast, are on by default
    // and their data is already showing.
    await expect(depsTable.getByRole("columnheader", { name: "License" })).toBeVisible();
    await expect(depsTable.getByRole("columnheader", { name: "Git stars" })).toBeVisible();
});

test("Columns, Deps, Dev Deps collapse as accordions; Deps and Dev Deps start open", async ({
    page,
}) => {
    await page.goto("/");

    const columnsSection = page.locator("details.accordion").nth(0);
    const depsSection = page.locator("details.accordion").nth(1);
    const devDepsSection = page.locator("details.accordion").nth(2);

    await expect(columnsSection).toHaveJSProperty("open", false);
    await expect(depsSection).toHaveJSProperty("open", true);
    await expect(devDepsSection).toHaveJSProperty("open", true);
    await expect(depsSection.locator("table.deps-table")).toBeVisible();
    await expect(columnsSection.locator(".column-visibility-panel")).not.toBeVisible();

    // Collapsing Deps hides its table but leaves Dev Deps and Columns as-is.
    await depsSection.locator("summary").click();
    await expect(depsSection).toHaveJSProperty("open", false);
    await expect(depsSection.locator("table.deps-table")).not.toBeVisible();
    await expect(devDepsSection).toHaveJSProperty("open", true);
    await expect(columnsSection).toHaveJSProperty("open", false);

    // Expanding it again reveals the table.
    await depsSection.locator("summary").click();
    await expect(depsSection).toHaveJSProperty("open", true);
    await expect(depsSection.locator("table.deps-table")).toBeVisible();

    // Same collapse/expand behaviour for the Columns panel.
    await columnsSection.locator("summary").click();
    await expect(columnsSection).toHaveJSProperty("open", true);
    await expect(columnsSection.locator(".column-visibility-panel")).toBeVisible();
});

test("loads app, renders default package.json dependency table", async ({ page }) => {
    await page.goto("/");
    await expandAllSections(page);
    await expect(page.getByRole("heading", { name: "Package.json info" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "vue", exact: true })).toBeVisible();
});

test("URL input fetches repo host URL via raw-file API", async ({ page }) => {
    await page.route(`${GITHUB_RAW_URL}/some-owner/some-repo/main/package.json`, async (route) => {
        await route.fulfill({
            json: { name: "some-repo", dependencies: { "repo-dep": "1.0.0" } },
        });
    });

    await page.goto("/");
    await expandAllSections(page);
    await fetchFromUrlInput(page, "https://github.com/some-owner/some-repo");

    await expect(page.getByRole("cell", { name: "repo-dep", exact: true })).toBeVisible();
});

test("URL input loads GitHub blob URL's file at its ref", async ({ page }) => {
    await page.route(
        `${GITHUB_RAW_URL}/some-owner/some-repo/feat/x/packages/a/package.json`,
        async (route) => {
            await route.fulfill({
                json: { name: "pkg-a", dependencies: { "blob-dep": "1.0.0" } },
            });
        },
    );

    await page.goto("/");
    await expandAllSections(page);
    await fetchFromUrlInput(
        page,
        "https://github.com/some-owner/some-repo/blob/feat/x/packages/a/package.json",
    );

    await expect(page.getByRole("cell", { name: "blob-dep", exact: true })).toBeVisible();
});

const MONOREPO_URL = "https://github.com/mono-owner/mono-repo";
const MONOREPO_RAW_URL = `${GITHUB_RAW_URL}/mono-owner/mono-repo/main`;
const MONOREPO_TREE_URL = `${GITHUB_API_URL}/repos/mono-owner/mono-repo/git/trees/main?recursive=1`;
const MONOREPO_ROOT = {
    name: "mono-root",
    workspaces: ["packages/*"],
    devDependencies: { "root-dep": "1.0.0" },
};

test("GitHub monorepo URL lists pnpm workspaces, picked workspace loads, Back returns to root", async ({
    page,
}) => {
    await page.route(`${MONOREPO_RAW_URL}/package.json`, async (route) => {
        await route.fulfill({
            json: { name: "mono-root", devDependencies: { "root-dep": "1.0.0" } },
        });
    });
    await page.route(`${MONOREPO_RAW_URL}/pnpm-workspace.yaml`, async (route) => {
        await route.fulfill({ body: "packages:\n  - 'packages/*'\n" });
    });
    await page.route(`${MONOREPO_RAW_URL}/packages/core/package.json`, async (route) => {
        await route.fulfill({ json: { name: "mono-core", dependencies: { "core-dep": "1.0.0" } } });
    });
    await page.route(MONOREPO_TREE_URL, async (route) => {
        await route.fulfill({ json: githubTreeBody(["packages/core", "packages/ui"]) });
    });

    await page.goto("/");
    await expandAllSections(page);
    await fetchFromUrlInput(page, MONOREPO_URL);

    const workspaceSelect = page.getByLabel("Workspace");
    await expect(workspaceSelect.locator("option")).toHaveText([
        "(root)",
        "packages/core",
        "packages/ui",
    ]);
    await expect(page.getByRole("cell", { name: "root-dep", exact: true })).toBeVisible();

    await workspaceSelect.selectOption("packages/core");
    await expect(page.getByRole("heading", { name: "mono-core" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "core-dep", exact: true })).toBeVisible();
    await expect(workspaceSelect).toHaveValue("packages/core");

    await page.getByRole("button", { name: "← Back" }).click();
    await expect(page.getByRole("heading", { name: "mono-root" })).toBeVisible();
    await expect(workspaceSelect).toHaveValue("");
});

test("missing workspace package.json shows error, keeps root loaded, select back on root", async ({
    page,
}) => {
    await page.route(`${MONOREPO_RAW_URL}/package.json`, async (route) => {
        await route.fulfill({ json: MONOREPO_ROOT });
    });
    await page.route(`${MONOREPO_RAW_URL}/packages/gone/package.json`, async (route) => {
        await route.fulfill({ status: 404 });
    });
    await page.route(MONOREPO_TREE_URL, async (route) => {
        await route.fulfill({ json: githubTreeBody(["packages/gone"]) });
    });
    await page.goto("/");
    await expandAllSections(page);
    await fetchFromUrlInput(page, MONOREPO_URL);
    const workspaceSelect = page.getByLabel("Workspace");
    await expect(workspaceSelect.locator("option")).toHaveText(["(root)", "packages/gone"]);

    await workspaceSelect.selectOption("packages/gone");

    await expect(page.locator(".banner--error")).toContainText("packages/gone");
    await expect(page.getByRole("heading", { name: "mono-root" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "root-dep", exact: true })).toBeVisible();
    await expect(workspaceSelect).toHaveValue("");
    await expect(workspaceSelect).toBeEnabled();
});

test("rate-limited workspace listing shows notice, root package.json still loads", async ({
    page,
}) => {
    await page.route(`${MONOREPO_RAW_URL}/package.json`, async (route) => {
        await route.fulfill({ json: MONOREPO_ROOT });
    });
    await page.route(MONOREPO_TREE_URL, async (route) => {
        await route.fulfill({ status: 403 });
    });
    await page.goto("/");
    await expandAllSections(page);

    await fetchFromUrlInput(page, MONOREPO_URL);

    await expect(page.getByRole("heading", { name: "mono-root" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "root-dep", exact: true })).toBeVisible();
    await expect(page.getByText("Could not check this repository for workspaces")).toBeVisible();
    await expect(page.getByLabel("Workspace")).toHaveCount(0);
    await expect(page.locator(".banner--error")).toHaveCount(0);
});

test("URL input fetches non-repo-host URL directly", async ({ page }) => {
    await page.route("https://example.com/some/package.json", async (route) => {
        await route.fulfill({
            json: { name: "remote-pkg", dependencies: { "remote-dep": "1.0.0" } },
        });
    });

    await page.goto("/");
    await expandAllSections(page);
    await fetchFromUrlInput(page, "https://example.com/some/package.json");

    await expect(page.getByRole("cell", { name: "remote-dep", exact: true })).toBeVisible();
});

test("URL input syncs with ?inputUrl= query param", async ({ page }) => {
    // Loading with the param already set pre-fills the input.
    await page.goto("/?inputUrl=https%3A%2F%2Fexample.com%2Fpackage.json");
    const urlInputField = page.getByLabel(
        "Enter a package.json URL, or a GitHub/GitLab/Codeberg repo URL",
    );
    await expect(urlInputField).toHaveValue("https://example.com/package.json");

    // Typing into it updates the query param (via replaceState, so this
    // doesn't push a new browser history entry for every keystroke).
    await urlInputField.fill("https://example.com/other.json");
    await expect
        .poll(() => page.evaluate(() => window.location.search))
        .toBe("?inputUrl=https%3A%2F%2Fexample.com%2Fother.json");

    // Clearing it removes the param entirely rather than leaving it empty.
    await urlInputField.fill("");
    await expect.poll(() => page.evaluate(() => window.location.search)).toBe("");
});

test("paste-from-clipboard button reads clipboard, replaces table", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/");
    await expandAllSections(page);

    await page.evaluate(
        (text) => navigator.clipboard.writeText(text),
        JSON.stringify({
            name: "demo",
            dependencies: { "left-pad": "^1.0.0" },
            devDependencies: {},
        }),
    );
    await page.getByRole("button", { name: "Paste from clipboard" }).click();

    await expect(page.getByRole("cell", { name: "left-pad", exact: true })).toBeVisible();
});

test("row Name cell click loads package's package.json as input", async ({ page }) => {
    await page.route(`${NPM_REGISTRY_URL}/left-pad`, async (route) => {
        await route.fulfill({
            json: {
                "dist-tags": { latest: "1.0.0" },
                time: { "1.0.0": "2020-01-01T00:00:00.000Z", modified: "2020-01-01T00:00:00.000Z" },
                versions: {
                    "1.0.0": {
                        name: "left-pad",
                        version: "1.0.0",
                        dependencies: { "nested-dep": "^1.0.0" },
                    },
                },
            },
        });
    });
    await page.route(`${NPM_REGISTRY_URL}/nested-dep`, async (route) => {
        await route.fulfill({ json: minimalRegistryDoc });
    });

    await page.goto("/");
    await expandAllSections(page);
    await loadJson(page, {
        name: "demo",
        dependencies: { "left-pad": "^1.0.0" },
        devDependencies: {},
    });

    const depsTable = page.locator("table.deps-table").first();
    const row = depsTable.locator("tbody tr").filter({ hasText: "left-pad" });
    await row.getByRole("cell", { name: "left-pad", exact: true }).click();

    // The table now reflects left-pad's own package.json: its dependency
    // shows up, and left-pad itself is no longer the input's own dependency.
    await expect(depsTable.getByRole("cell", { name: "nested-dep", exact: true })).toBeVisible();
    await expect(depsTable.getByRole("cell", { name: "left-pad", exact: true })).toHaveCount(0);
});

test("row data cell click opens package summary card", async ({ page }) => {
    await page.goto("/");
    await expandAllSections(page);
    await loadJson(page, {
        name: "demo",
        dependencies: { "left-pad": "^1.0.0" },
        devDependencies: {},
    });

    const depsTable = page.locator("table.deps-table").first();
    const row = depsTable.locator("tbody tr").filter({ hasText: "left-pad" });

    // A plain data cell (Version) opens the summary card in the modal - the
    // Name cell has its own click behaviour (see the test above) and is
    // deliberately excluded from this one.
    await row.getByRole("cell", { name: "^1.0.0", exact: true }).click();
    await expect(page.locator(".package-summary__name")).toHaveText("left-pad");

    await page.getByRole("button", { name: "Close", exact: true }).click();
    await expect(page.locator(".package-summary__name")).toHaveCount(0);
});

test("share link replays steps, Back and drill-down rewrite link", async ({ page }) => {
    const urlStep = "url:https://github.com/some-owner/some-repo";
    const dependencyStep = "dep:left-pad@^1.0.0";
    const linkSteps = () =>
        page.evaluate(
            (param) => new URLSearchParams(window.location.search).getAll(param),
            SHARE_STEP_QUERY_PARAM,
        );
    await page.route(`${GITHUB_RAW_URL}/some-owner/some-repo/main/package.json`, async (route) => {
        await route.fulfill({
            json: { name: "some-repo", dependencies: { "left-pad": "^1.0.0" } },
        });
    });
    await page.route(`${NPM_REGISTRY_URL}/left-pad`, async (route) => {
        await route.fulfill({
            json: {
                "dist-tags": { latest: "1.0.0" },
                time: { "1.0.0": "2020-01-01T00:00:00.000Z", modified: "2020-01-01T00:00:00.000Z" },
                versions: {
                    "1.0.0": {
                        name: "left-pad",
                        version: "1.0.0",
                        dependencies: { "nested-dep": "^1.0.0" },
                    },
                },
            },
        });
    });
    await page.route(`${NPM_REGISTRY_URL}/nested-dep`, async (route) => {
        await route.fulfill({ json: minimalRegistryDoc });
    });

    const params = new URLSearchParams([
        [SHARE_STEP_QUERY_PARAM, urlStep],
        [SHARE_STEP_QUERY_PARAM, dependencyStep],
    ]);
    await page.goto(`/?${params}`);
    await expandAllSections(page);

    // Built-in package.json, then one entry per step.
    const depsTable = page.locator("table.deps-table").first();
    await expect(page.getByRole("heading", { name: "left-pad" })).toBeVisible();
    await expect(depsTable.getByRole("cell", { name: "nested-dep", exact: true })).toBeVisible();
    await expect(page.getByText("3 / 3", { exact: true })).toBeVisible();
    await expect.poll(linkSteps).toEqual([urlStep, dependencyStep]);

    await page.getByRole("button", { name: "← Back" }).click();
    await expect(page.getByRole("heading", { name: "some-repo" })).toBeVisible();
    await expect(page.getByText("2 / 3", { exact: true })).toBeVisible();
    await expect.poll(linkSteps).toEqual([urlStep]);

    await depsTable.getByRole("cell", { name: "left-pad", exact: true }).click();
    await expect(page.getByRole("heading", { name: "left-pad" })).toBeVisible();
    await expect.poll(linkSteps).toEqual([urlStep, dependencyStep]);
});

test("back/forward buttons navigate loaded package.json states", async ({ page }) => {
    await page.goto("/");
    await expandAllSections(page);

    // Only one history entry so far, so the history controls don't render at all.
    await expect(page.getByRole("button", { name: "← Back" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Forward →" })).toHaveCount(0);

    await loadJson(page, {
        name: "demo",
        dependencies: { "history-pkg": "1.0.0" },
        devDependencies: {},
    });

    const depsTable = page.locator("table.deps-table").first();
    await expect(depsTable.getByRole("cell", { name: "history-pkg", exact: true })).toBeVisible();
    await expect(page.getByText("2 / 2", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "← Back" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Forward →" })).toBeDisabled();

    await page.getByRole("button", { name: "← Back" }).click();
    await expect(depsTable.getByRole("cell", { name: "vue", exact: true })).toBeVisible();
    await expect(page.getByText("1 / 2", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "← Back" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Forward →" })).toBeEnabled();

    await page.getByRole("button", { name: "Forward →" }).click();
    await expect(depsTable.getByRole("cell", { name: "history-pkg", exact: true })).toBeVisible();
    await expect(page.getByText("2 / 2", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Forward →" })).toBeDisabled();
});

test("history back/forward reuses cached data, no refetch", async ({ page }) => {
    let vueRequests = 0;
    await page.route(`${NPM_REGISTRY_URL}/vue`, async (route) => {
        vueRequests++;
        await route.fulfill({ json: { "dist-tags": { latest: "3.5.34" }, time: {} } });
    });
    let cachedPkgRequests = 0;
    await page.route(`${NPM_REGISTRY_URL}/cached-history-pkg`, async (route) => {
        cachedPkgRequests++;
        await route.fulfill({ json: minimalRegistryDoc });
    });

    await page.goto("/");
    await expandAllSections(page);
    const depsTable = page.locator("table.deps-table").first();
    await expect(depsTable.getByRole("cell", { name: "vue", exact: true })).toBeVisible();
    expect(vueRequests).toBe(1);

    await loadJson(page, {
        name: "demo",
        dependencies: { "cached-history-pkg": "1.0.0" },
        devDependencies: {},
    });
    await expect(
        depsTable.getByRole("cell", { name: "cached-history-pkg", exact: true }),
    ).toBeVisible();
    expect(cachedPkgRequests).toBe(1);

    await page.getByRole("button", { name: "← Back" }).click();
    await expect(depsTable.getByRole("cell", { name: "vue", exact: true })).toBeVisible();
    expect(vueRequests).toBe(1);

    await page.getByRole("button", { name: "Forward →" }).click();
    await expect(
        depsTable.getByRole("cell", { name: "cached-history-pkg", exact: true }),
    ).toBeVisible();
    expect(cachedPkgRequests).toBe(1);
});

test("loading content after back discards forward history", async ({ page }) => {
    await page.goto("/");
    await expandAllSections(page);

    await loadJson(page, {
        name: "a",
        dependencies: { "state-a-pkg": "1.0.0" },
        devDependencies: {},
    });
    await expect(page.getByText("2 / 2", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "← Back" }).click();
    await expect(page.getByText("1 / 2", { exact: true })).toBeVisible();

    await loadJson(page, {
        name: "b",
        dependencies: { "state-b-pkg": "1.0.0" },
        devDependencies: {},
    });

    const depsTable = page.locator("table.deps-table").first();
    await expect(depsTable.getByRole("cell", { name: "state-b-pkg", exact: true })).toBeVisible();
    await expect(page.getByText("2 / 2", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Forward →" })).toBeDisabled();

    await page.getByRole("button", { name: "← Back" }).click();
    await expect(depsTable.getByRole("cell", { name: "vue", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "← Back" })).toBeDisabled();
});

test("invalid JSON paste shows inline error, no crash", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/");

    await page.evaluate(() => navigator.clipboard.writeText("{ not valid json"));
    await page.getByRole("button", { name: "Paste from clipboard" }).click();

    await expect(page.locator(".banner--error")).toContainText("not valid JSON");
    await expect(page.getByRole("heading", { name: "Package.json info" })).toBeVisible();
});

test("header click sorts table, second click reverses", async ({ page }) => {
    const weeklyDownloadsByPackage: Record<string, number> = {
        "aaa-pkg": 100,
        "bbb-pkg": 300,
        "ccc-pkg": 200,
    };
    await page.route(`${NPM_WEEKLY_DOWNLOADS_URL}/**`, async (route) => {
        const name = decodeURIComponent(
            new URL(route.request().url()).pathname.split("/").pop() ?? "",
        );
        await route.fulfill({ json: { downloads: weeklyDownloadsByPackage[name] ?? 0 } });
    });

    await page.goto("/");
    await expandAllSections(page);
    await loadJson(page, {
        name: "demo",
        dependencies: { "ccc-pkg": "^1.0.0", "aaa-pkg": "^1.0.0", "bbb-pkg": "^1.0.0" },
        devDependencies: {},
    });

    // Only one populated table (devDependencies is empty), but scope to it
    // explicitly since the empty Dev Deps table also renders a header row.
    const depsTable = page.locator("table.deps-table").first();
    await expect(depsTable.locator("tbody tr")).toHaveCount(3);

    const packageNameColumn = () =>
        depsTable.locator("tbody tr td:first-child .deps-table__name-text");
    await expect(packageNameColumn()).toHaveText(["ccc-pkg", "aaa-pkg", "bbb-pkg"]);

    await depsTable.getByRole("button", { name: /^Weekly downloads/ }).click();
    await expect(packageNameColumn()).toHaveText(["aaa-pkg", "ccc-pkg", "bbb-pkg"]);

    await depsTable.getByRole("button", { name: /^Weekly downloads/ }).click();
    await expect(packageNameColumn()).toHaveText(["bbb-pkg", "ccc-pkg", "aaa-pkg"]);
});

test("one search box filters Deps and Dev Deps tables", async ({ page }) => {
    await page.goto("/");
    await expandAllSections(page);
    await loadJson(page, {
        name: "demo",
        dependencies: { react: "^18.0.0", "react-dom": "^18.0.0", vue: "^3.0.0" },
        devDependencies: { "react-scripts": "^5.0.0", vite: "^5.0.0" },
    });

    const depsTable = page.locator("table.deps-table").nth(0);
    const devDepsTable = page.locator("table.deps-table").nth(1);
    await expect(depsTable.locator("tbody tr")).toHaveCount(3);
    await expect(devDepsTable.locator("tbody tr")).toHaveCount(2);

    // Only one search box exists in the whole page now.
    const searchInput = page.getByLabel("Search by name");
    await expect(searchInput).toHaveCount(1);

    await searchInput.fill("react");
    await expect(depsTable.locator("tbody tr td:first-child .deps-table__name-text")).toHaveText([
        "react",
        "react-dom",
    ]);
    await expect(devDepsTable.locator("tbody tr td:first-child .deps-table__name-text")).toHaveText(
        ["react-scripts"],
    );

    await searchInput.fill("no-such-package");
    await expect(depsTable.locator("tbody tr")).toHaveCount(0);
    await expect(devDepsTable.locator("tbody tr")).toHaveCount(0);

    await searchInput.fill("");
    await expect(depsTable.locator("tbody tr")).toHaveCount(3);
    await expect(devDepsTable.locator("tbody tr")).toHaveCount(2);
});

test("renders license, outdated, deprecated, vulnerability, bundle size, maintainer data", async ({
    page,
}) => {
    await page.route(`${NPM_REGISTRY_URL}/**`, async (route) => {
        await route.fulfill({
            json: {
                "dist-tags": { latest: "2.0.0" },
                time: {
                    "1.0.0": "2023-01-01T00:00:00.000Z",
                    "2.0.0": "2024-01-01T00:00:00.000Z",
                    modified: "2024-06-01T00:00:00.000Z",
                },
                maintainers: [{ name: "alice" }, { name: "bob" }],
                versions: {
                    "1.0.0": { license: "GPL-3.0", deprecated: "please upgrade" },
                },
            },
        });
    });
    await page.route(OSV_QUERY_URL, async (route) => {
        await route.fulfill({ json: { vulns: [{ id: "GHSA-xxxx-xxxx-xxxx" }] } });
    });
    await page.route(`${BUNDLEPHOBIA_SIZE_URL}**`, async (route) => {
        await route.fulfill({ json: { gzip: 2048 } });
    });

    await page.goto("/");
    await expandAllSections(page);
    await loadJson(page, {
        name: "demo",
        dependencies: { "enriched-pkg": "1.0.0" },
        devDependencies: {},
    });

    // Vulnerabilities, Bundle size, and Maintainers are hidden by default;
    // opt into them to check their data too.
    await page.getByLabel("Vulnerabilities", { exact: true }).check();
    await page.getByLabel("Bundle size (gzip)", { exact: true }).check();
    await page.getByLabel("Maintainers", { exact: true }).check();

    const depsTable = page.locator("table.deps-table").first();
    const row = depsTable.locator("tbody tr").filter({ hasText: "enriched-pkg" });

    await expect(row.getByRole("cell", { name: "GPL-3.0 ⚠", exact: true })).toBeVisible();
    await expect(row.getByRole("cell", { name: "Yes", exact: true })).toBeVisible();
    await expect(row.getByRole("cell", { name: "please upgrade", exact: true })).toBeVisible();
    await expect(row.getByRole("cell", { name: "1", exact: true })).toBeVisible();
    await expect(row.getByRole("cell", { name: "2.0 KB", exact: true })).toBeVisible();
    await expect(row.getByRole("cell", { name: "alice, bob", exact: true })).toBeVisible();
});

test("registry outage after reload shows stored row with stale badge and health score", async ({
    page,
}) => {
    let isRegistryDown = false;
    await page.route(`${NPM_REGISTRY_URL}/offline-pkg`, async (route) => {
        if (isRegistryDown) {
            await route.abort();
            return;
        }
        // Fresh, current, not deprecated, 3 maintainers, no repo lookups: every signal healthy.
        await route.fulfill({
            json: {
                "dist-tags": { latest: "1.0.0" },
                time: { "1.0.0": new Date().toISOString() },
                maintainers: [{ name: "a" }, { name: "b" }, { name: "c" }],
                versions: { "1.0.0": {} },
            },
        });
    });
    const offlinePackageJson = { name: "demo", dependencies: { "offline-pkg": "1.0.0" } };
    const depsTable = page.locator("table.deps-table").first();
    const row = depsTable.locator("tbody tr").filter({ hasText: "offline-pkg" });

    await page.goto("/");
    await expandAllSections(page);
    await loadJson(page, offlinePackageJson);
    await expect(row.getByRole("cell", { name: "100 good", exact: true })).toBeVisible();
    await expect(row.locator(".deps-table__stale-badge")).toHaveCount(0);
    await expect.poll(() => hasStoredLookup(page, "registry:offline-pkg")).toBe(true);

    isRegistryDown = true;
    await page.reload();
    await expandAllSections(page);
    await loadJson(page, offlinePackageJson);

    await expect(row.locator(".deps-table__stale-badge")).toHaveText("stale");
    // Health needs the registry document, so a score proves the stored one was used.
    await expect(row.getByRole("cell", { name: "100 good", exact: true })).toBeVisible();
});

test("failed downloads lookup shows '?', retry button shows number", async ({ page }) => {
    let isDownloadsDown = true;
    await page.route(`${NPM_WEEKLY_DOWNLOADS_URL}/flaky-pkg`, async (route) => {
        if (isDownloadsDown) {
            await route.abort();
            return;
        }
        await route.fulfill({ json: { downloads: 777 } });
    });
    const depsTable = page.locator("table.deps-table").first();
    const row = depsTable.locator("tbody tr").filter({ hasText: "flaky-pkg" });

    await page.goto("/");
    await expandAllSections(page);
    await loadJson(page, { name: "demo", dependencies: { "flaky-pkg": "1.0.0" } });

    const failedCell = row.locator(".dependency-cell--failed");
    await expect(failedCell).toHaveText("?");
    await failedCell.hover();
    await expect(page.getByRole("tooltip")).toContainText("Lookup failed:");

    isDownloadsDown = false;
    await row.getByRole("button", { name: "Retry lookups for flaky-pkg" }).click();

    await expect(row.getByRole("cell", { name: "777", exact: true })).toBeVisible();
    await expect(failedCell).toHaveCount(0);
    await expect(row.getByRole("button", { name: "Retry lookups for flaky-pkg" })).toHaveCount(0);
    // Retry is not a drill-down: the loaded package.json stays.
    await expect(depsTable.getByRole("cell", { name: "flaky-pkg", exact: true })).toBeVisible();
});

test("hidden column skips request, re-shown column fetches missing data", async ({ page }) => {
    const osvRequestedNames: string[] = [];
    await page.route(OSV_QUERY_URL, async (route) => {
        const body = route.request().postDataJSON() as { package: { name: string } };
        osvRequestedNames.push(body.package.name);
        await route.fulfill({ json: { vulns: [{ id: "GHSA-test" }] } });
    });
    await page.route(`${NPM_REGISTRY_URL}/gated-pkg`, async (route) => {
        await route.fulfill({ json: minimalRegistryDoc });
    });

    await page.goto("/");
    await expandAllSections(page);

    // Hide the Vulnerabilities column before loading the package under test.
    await page.getByLabel("Vulnerabilities", { exact: true }).uncheck();

    await loadJson(page, {
        name: "demo",
        dependencies: { "gated-pkg": "1.0.0" },
        devDependencies: {},
    });

    const depsTable = page.locator("table.deps-table").first();
    await expect(depsTable.getByRole("cell", { name: "gated-pkg", exact: true })).toBeVisible();

    expect(osvRequestedNames).not.toContain("gated-pkg");
    await expect(depsTable.getByRole("columnheader", { name: "Vulnerabilities" })).toHaveCount(0);

    // Re-showing the column should fetch the data that was never requested.
    await page.getByLabel("Vulnerabilities", { exact: true }).check();

    const row = depsTable.locator("tbody tr").filter({ hasText: "gated-pkg" });
    await expect(row.getByRole("cell", { name: "1", exact: true })).toBeVisible();
    expect(osvRequestedNames).toContain("gated-pkg");
});

test("column visibility panel hides/shows columns, never below floor", async ({ page }) => {
    await page.goto("/");
    await expandAllSections(page);
    const depsTable = page.locator("table.deps-table").first();

    await expect(depsTable.getByRole("columnheader", { name: "License" })).toBeVisible();

    await page.getByLabel("License", { exact: true }).uncheck();
    await expect(depsTable.getByRole("columnheader", { name: "License" })).toHaveCount(0);

    await page.getByLabel("License", { exact: true }).check();
    await expect(depsTable.getByRole("columnheader", { name: "License" })).toBeVisible();

    // Hide every toggleable column except "Version" to hit the floor: Name
    // is always visible, so this should bottom out at Name plus Version (two
    // total), not fewer.
    const allLabels = (await page.locator(".column-visibility-panel label").allTextContents()).map(
        (t) => t.trim(),
    );
    for (const label of allLabels) {
        if (label === "Version") {
            continue;
        }
        await page.getByLabel(label, { exact: true }).uncheck();
    }

    await expect(page.getByLabel("Version", { exact: true })).toBeDisabled();
    await expect(depsTable.getByRole("columnheader", { name: "Name" })).toBeVisible();
    await expect(
        depsTable.getByRole("columnheader", { name: "Version", exact: true }),
    ).toBeVisible();
    await expect(depsTable.locator("thead th")).toHaveCount(2);
});

test("column visibility preferences persist across reload", async ({ page }) => {
    await page.goto("/");
    await expandAllSections(page);
    const depsTable = page.locator("table.deps-table").first();

    await expect(depsTable.getByRole("columnheader", { name: "License" })).toBeVisible();
    await expect(depsTable.getByRole("columnheader", { name: "Maintainers" })).toHaveCount(0);

    // Flip both: hide a default-visible column, show a default-hidden one.
    await page.getByLabel("License", { exact: true }).uncheck();
    await page.getByLabel("Maintainers", { exact: true }).check();
    await expect(depsTable.getByRole("columnheader", { name: "License" })).toHaveCount(0);
    await expect(depsTable.getByRole("columnheader", { name: "Maintainers" })).toBeVisible();

    await page.reload();
    await expandAllSections(page);

    await expect(depsTable.getByRole("columnheader", { name: "License" })).toHaveCount(0);
    await expect(depsTable.getByRole("columnheader", { name: "Maintainers" })).toBeVisible();
    expect(await page.getByLabel("License", { exact: true }).isChecked()).toBe(false);
    expect(await page.getByLabel("Maintainers", { exact: true }).isChecked()).toBe(true);
});

test("header reflects column order seeded in localStorage", async ({ page }) => {
    // A full permutation of every toggleable column, reversed from
    // declaration order - also doubles as "everything visible" so the test
    // isolates ordering from the separate visibility feature.
    const order = TOGGLEABLE_COLUMNS.map((c) => c.key).reverse();
    await page.addInitScript(
        ({ order }) => {
            localStorage.setItem("package-json-info:columnOrder", JSON.stringify(order));
            localStorage.setItem("package-json-info:visibleColumns", JSON.stringify(order));
        },
        { order },
    );

    await page.goto("/");
    await expandAllSections(page);
    const depsTable = page.locator("table.deps-table").first();

    const headerTexts = (await depsTable.locator("thead th").allTextContents()).map((t) =>
        t.replace(/[\s▲▼]+$/, "").trim(),
    );
    const expectedLabels = [
        "Name",
        ...order.map((key) => TOGGLEABLE_COLUMNS.find((c) => c.key === key)!.label),
    ];
    expect(headerTexts).toEqual(expectedLabels);
});

test("header drag by handle reorders table, order persists across reload", async ({ page }) => {
    await page.goto("/");
    await expandAllSections(page);
    const depsTable = page.locator("table.deps-table").first();
    const headerCells = depsTable.locator("thead th");

    // With Deps, Dev Deps, and package.json all expanded by default, the
    // Deps header can sit below the fold - scroll it into view first so the
    // raw page.mouse coordinates below land on it rather than whatever
    // happens to occupy that viewport position.
    await depsTable.scrollIntoViewIfNeeded();

    // Index 0 is the pinned Name column, so the first two draggable columns
    // (indices 1 and 2) are swapped.
    const firstLabel = (await headerCells.nth(1).innerText()).trim();
    const secondLabel = (await headerCells.nth(2).innerText()).trim();

    const firstBox = await headerCells.nth(1).locator(".deps-table__drag-handle").boundingBox();
    const secondBox = await headerCells.nth(2).locator(".deps-table__drag-handle").boundingBox();
    if (!firstBox || !secondBox) {
        throw new Error("Drag handle bounding box not available.");
    }

    await page.mouse.move(firstBox.x + firstBox.width / 2, firstBox.y + firstBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(secondBox.x + secondBox.width / 2, secondBox.y + secondBox.height / 2, {
        steps: 10,
    });
    await page.mouse.move(
        secondBox.x + secondBox.width / 2 + 5,
        secondBox.y + secondBox.height / 2,
        { steps: 5 },
    );
    await page.mouse.up();

    await expect(headerCells.nth(1)).toContainText(secondLabel);
    await expect(headerCells.nth(2)).toContainText(firstLabel);

    await page.reload();
    await expandAllSections(page);
    const reloadedHeaderCells = page.locator("table.deps-table").first().locator("thead th");
    await expect(reloadedHeaderCells.nth(1)).toContainText(secondLabel);
    await expect(reloadedHeaderCells.nth(2)).toContainText(firstLabel);
});

test("shrink columns shows initials with full-name tooltip, persists across reload", async ({
    page,
}) => {
    await page.goto("/");
    await expandAllSections(page);
    const depsTable = page.locator("table.deps-table").first();

    await expect(depsTable.getByRole("columnheader", { name: "Version Date" })).toBeVisible();

    const shrinkCheckbox = page.getByLabel("Shrink columns by abbreviation");
    await expect(shrinkCheckbox).not.toBeChecked();
    await shrinkCheckbox.check();

    // Multi-word labels abbreviate to initials...
    const versionDateLabel = depsTable.locator(".deps-table__col-label", { hasText: "VD" });
    await expect(versionDateLabel).toBeVisible();
    await expect(depsTable.getByRole("columnheader", { name: "Version Date" })).toHaveCount(0);
    await versionDateLabel.hover();
    await expect(page.getByRole("tooltip", { name: "Version Date" })).toBeVisible();

    // ...but a single-word label like "Outdated" is left untouched.
    await expect(depsTable.getByRole("columnheader", { name: "Outdated" })).toBeVisible();

    await page.reload();
    await expandAllSections(page);
    const reloadedDepsTable = page.locator("table.deps-table").first();

    await expect(page.getByLabel("Shrink columns by abbreviation")).toBeChecked();
    await expect(
        reloadedDepsTable.locator(".deps-table__col-label", { hasText: "VD" }),
    ).toBeVisible();
});

const TREE_PACKAGE_TARBALL_URL = `${NPM_REGISTRY_URL}/tree-pkg/-/tree-pkg-1.0.0.tgz`;

/** Loads a package.json whose one dependency, tree-pkg, downloads `tarball` as its source. */
async function loadPackageWithTarball(page: Page, tarball: Buffer) {
    await page.route(`${NPM_REGISTRY_URL}/tree-pkg`, async (route) => {
        await route.fulfill({
            json: {
                ...minimalRegistryDoc,
                versions: { "1.0.0": { dist: { tarball: TREE_PACKAGE_TARBALL_URL } } },
            },
        });
    });
    await page.route(TREE_PACKAGE_TARBALL_URL, async (route) => {
        await route.fulfill({ contentType: "application/octet-stream", body: tarball });
    });
    await page.goto("/");
    await expandAllSections(page);
    await page.getByLabel("Source Code Tree", { exact: true }).check();
    await loadJson(page, { name: "demo", dependencies: { "tree-pkg": "1.0.0" } });
}

test("View tree downloads npm tarball, browses folder, shows file content", async ({ page }) => {
    await loadPackageWithTarball(
        page,
        Buffer.from(
            buildNpmTarball({
                "index.js": "module.exports = 1;",
                "src/helper.js": "export const helper = 2;",
            }),
        ),
    );

    await page.getByRole("button", { name: "View tree" }).click();
    const sourceTree = page.locator(".source-tree");
    await expect(sourceTree).toContainText("via npm");
    await sourceTree.getByRole("button", { name: "src" }).click();
    await sourceTree.getByRole("button", { name: "helper.js" }).click();

    await expect(sourceTree.locator(".source-tree__content")).toHaveText(
        "export const helper = 2;",
    );

    await page.keyboard.press("Escape");
    await expect(sourceTree).toHaveCount(0);
});

test("View tree shows error for corrupt tarball", async ({ page }) => {
    await loadPackageWithTarball(page, Buffer.from("<html>not a tarball</html>"));

    await page.getByRole("button", { name: "View tree" }).click();

    await expect(page.locator(".source-tree__status--error")).toHaveText(
        "The package tarball is corrupt or incomplete.",
    );
});
