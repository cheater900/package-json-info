import { test, expect } from "@playwright/test";
import { mockExternalApis, loadJson, expandAllSections } from "./helpers";
import { TOGGLEABLE_COLUMNS } from "../../src/utils/tableColumns";

test.beforeEach(async ({ page }) => {
    await mockExternalApis(page);
});

test("the dependency table scrolls horizontally, since it has more columns than fit on screen", async ({
    page,
}) => {
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

test("caches metadata so a package listed in both dependencies and devDependencies is only fetched once", async ({
    page,
}) => {
    let registryRequests = 0;
    await page.route("https://registry.npmjs.org/shared-pkg", async (route) => {
        registryRequests++;
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ "dist-tags": { latest: "1.0.0" }, time: {} }),
        });
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

test("hides Vulnerabilities, Bundle size, and Maintainers by default, and never contacts the third-party services on a fresh load", async ({
    page,
}) => {
    let osvRequests = 0;
    let bundlephobiaRequests = 0;
    await page.route("https://api.osv.dev/**", async (route) => {
        osvRequests++;
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ vulns: [] }),
        });
    });
    await page.route("https://bundlephobia.com/**", async (route) => {
        bundlephobiaRequests++;
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ gzip: 1 }),
        });
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

test("Columns, Deps, and Dev Deps are collapsible accordions; Deps and Dev Deps start open", async ({
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

test("loads the app and renders the default package.json dependency table", async ({ page }) => {
    await page.goto("/");
    await expandAllSections(page);
    await expect(page.getByRole("heading", { name: "Package.json info" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "vue", exact: true })).toBeVisible();
});

test("the URL input fetches from a repo host (GitHub/GitLab/Codeberg) via its raw-file API", async ({
    page,
}) => {
    await page.route(
        "https://raw.githubusercontent.com/some-owner/some-repo/main/package.json",
        async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({ name: "some-repo", dependencies: { "repo-dep": "1.0.0" } }),
            });
        },
    );

    await page.goto("/");
    await expandAllSections(page);
    await page
        .getByLabel("Enter a package.json URL, or a GitHub/GitLab/Codeberg repo URL")
        .fill("https://github.com/some-owner/some-repo");
    await page.getByRole("button", { name: "FETCH" }).click();

    await expect(page.getByRole("cell", { name: "repo-dep", exact: true })).toBeVisible();
});

test("the URL input fetches a plain URL directly when its host isn't a supported repo host", async ({
    page,
}) => {
    await page.route("https://example.com/some/package.json", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ name: "remote-pkg", dependencies: { "remote-dep": "1.0.0" } }),
        });
    });

    await page.goto("/");
    await expandAllSections(page);
    await page
        .getByLabel("Enter a package.json URL, or a GitHub/GitLab/Codeberg repo URL")
        .fill("https://example.com/some/package.json");
    await page.getByRole("button", { name: "FETCH" }).click();

    await expect(page.getByRole("cell", { name: "remote-dep", exact: true })).toBeVisible();
});

test("the URL input stays in sync with the ?inputUrl= query param", async ({ page }) => {
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

test("the paste-from-clipboard button reads the clipboard and replaces the table", async ({
    page,
    context,
}) => {
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

test("clicking a row's Name cell loads that package's package.json as the new input", async ({
    page,
}) => {
    await page.route("https://registry.npmjs.org/left-pad", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                "dist-tags": { latest: "1.0.0" },
                time: { "1.0.0": "2020-01-01T00:00:00.000Z", modified: "2020-01-01T00:00:00.000Z" },
                versions: {
                    "1.0.0": {
                        name: "left-pad",
                        version: "1.0.0",
                        dependencies: { "nested-dep": "^1.0.0" },
                    },
                },
            }),
        });
    });
    await page.route("https://registry.npmjs.org/nested-dep", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ "dist-tags": { latest: "1.0.0" }, time: {} }),
        });
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

test("clicking a row's data cell opens the package summary card", async ({ page }) => {
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

test("back/forward buttons navigate between loaded package.json states", async ({ page }) => {
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

test("navigating history back and forward reuses cached data instead of refetching", async ({
    page,
}) => {
    let vueRequests = 0;
    await page.route("https://registry.npmjs.org/vue", async (route) => {
        vueRequests++;
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ "dist-tags": { latest: "3.5.34" }, time: {} }),
        });
    });
    let cachedPkgRequests = 0;
    await page.route("https://registry.npmjs.org/cached-history-pkg", async (route) => {
        cachedPkgRequests++;
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ "dist-tags": { latest: "1.0.0" }, time: {} }),
        });
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

test("loading new content while navigated back discards the old forward history", async ({
    page,
}) => {
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

test("pasting invalid JSON from the clipboard shows an inline error instead of crashing", async ({
    page,
    context,
}) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/");

    await page.evaluate(() => navigator.clipboard.writeText("{ not valid json"));
    await page.getByRole("button", { name: "Paste from clipboard" }).click();

    await expect(page.getByRole("alert")).toContainText("not valid JSON");
    await expect(page.getByRole("heading", { name: "Package.json info" })).toBeVisible();
});

test("clicking a column header sorts the table, and clicking again reverses it", async ({
    page,
}) => {
    const weeklyDownloadsByPackage: Record<string, number> = {
        "aaa-pkg": 100,
        "bbb-pkg": 300,
        "ccc-pkg": 200,
    };
    await page.route("https://api.npmjs.org/downloads/point/last-week/**", async (route) => {
        const name = decodeURIComponent(
            new URL(route.request().url()).pathname.split("/").pop() ?? "",
        );
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ downloads: weeklyDownloadsByPackage[name] ?? 0 }),
        });
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

test("a single search box filters both the Deps and Dev Deps tables simultaneously", async ({
    page,
}) => {
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

test("renders license, outdated, deprecated, vulnerability, bundle size, and maintainer data", async ({
    page,
}) => {
    await page.route("https://registry.npmjs.org/**", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
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
            }),
        });
    });
    await page.route("https://api.osv.dev/**", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ vulns: [{ id: "GHSA-xxxx-xxxx-xxxx" }] }),
        });
    });
    await page.route("https://bundlephobia.com/**", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ gzip: 2048 }),
        });
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

test("hiding a column skips its network request, and re-showing it fetches the missing data", async ({
    page,
}) => {
    const osvRequestedNames: string[] = [];
    await page.route("https://api.osv.dev/v1/query", async (route) => {
        const body = route.request().postDataJSON() as { package: { name: string } };
        osvRequestedNames.push(body.package.name);
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ vulns: [{ id: "GHSA-test" }] }),
        });
    });
    await page.route("https://registry.npmjs.org/gated-pkg", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ "dist-tags": { latest: "1.0.0" }, time: {} }),
        });
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

test("the column visibility panel hides/shows columns and never drops below the floor", async ({
    page,
}) => {
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
        if (label === "Version") continue;
        await page.getByLabel(label, { exact: true }).uncheck();
    }

    await expect(page.getByLabel("Version", { exact: true })).toBeDisabled();
    await expect(depsTable.getByRole("columnheader", { name: "Name" })).toBeVisible();
    await expect(
        depsTable.getByRole("columnheader", { name: "Version", exact: true }),
    ).toBeVisible();
    await expect(depsTable.locator("thead th")).toHaveCount(2);
});

test("column visibility preferences persist in localStorage across a page reload", async ({
    page,
}) => {
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

test("a column order preference seeded in localStorage is reflected in the rendered header", async ({
    page,
}) => {
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

test("dragging a column header by its handle reorders the table, and the new order persists across reload", async ({
    page,
}) => {
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

test("shrinking columns by abbreviation shows initials with a full-name tooltip, and persists across reload", async ({
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
