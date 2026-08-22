import { test, expect, type Page } from "@playwright/test"

/**
 * The app talks to the real npm registry, npm downloads API, and GitHub API.
 * Route every one of those through canned responses so the e2e suite runs
 * fully offline and isn't at the mercy of rate limits or flaky third parties.
 */
async function mockExternalApis(page: Page) {
  await page.route("https://registry.npmjs.org/**", async (route) => {
    const name = decodeURIComponent(new URL(route.request().url()).pathname.slice(1))
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        "dist-tags": { latest: "9.9.9" },
        time: { "9.9.9": "2024-01-01T00:00:00.000Z", modified: "2024-06-01T00:00:00.000Z" },
        repository: { type: "git", url: `git+https://github.com/example-org/${name}.git` },
        versions: { "9.9.9": { dependencies: {} } },
      }),
    })
  })

  await page.route("https://api.npmjs.org/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ downloads: 12345 }),
    })
  })

  await page.route("https://api.github.com/repos/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ stargazers_count: 42 }),
    })
  })

  await page.route("https://api.github.com/search/issues**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ total_count: 3 }),
    })
  })

  await page.route("https://api.osv.dev/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ vulns: [] }),
    })
  })

  await page.route("https://bundlephobia.com/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ gzip: 1024 }),
    })
  })
}

test.beforeEach(async ({ page }) => {
  await mockExternalApis(page)
})

test("the dependency table scrolls horizontally, since it has more columns than fit on screen", async ({ page }) => {
  await page.goto("/")
  const depsTable = page.locator("table.deps").first()
  await expect(depsTable).toBeVisible()

  const overflowX = await depsTable.evaluate((el) => getComputedStyle(el).overflowX)
  expect(["scroll", "auto"]).toContain(overflowX)

  const { scrollWidth, clientWidth } = await depsTable.evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
  }))
  expect(scrollWidth).toBeGreaterThan(clientWidth)

  // A genuinely scrollable element accepts a scrollLeft up to its overflow
  // amount; a non-scrollable one clamps straight back to 0.
  const scrolledLeft = await depsTable.evaluate((el) => {
    el.scrollLeft = el.scrollWidth
    return el.scrollLeft
  })
  expect(scrolledLeft).toBeGreaterThan(0)
})

test("caches metadata so a package listed in both dependencies and devDependencies is only fetched once", async ({ page }) => {
  let registryRequests = 0
  await page.route("https://registry.npmjs.org/shared-pkg", async (route) => {
    registryRequests++
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ "dist-tags": { latest: "1.0.0" }, time: {} }),
    })
  })

  await page.goto("/")
  const json = JSON.stringify({
    name: "demo",
    dependencies: { "shared-pkg": "1.0.0" },
    devDependencies: { "shared-pkg": "1.0.0" },
  })
  await page.getByLabel("Paste package.json content").fill(json)
  await page.getByRole("button", { name: "Load pasted JSON" }).click()

  // Both tables render their own row for the package; once both are up,
  // both watchers' fetches have settled.
  await expect(page.getByRole("cell", { name: "shared-pkg", exact: true })).toHaveCount(2)

  expect(registryRequests).toBe(1)
})

test("hides Vulnerabilities, Bundle size, and Maintainers by default, and never contacts the third-party services on a fresh load", async ({ page }) => {
  let osvRequests = 0
  let bundlephobiaRequests = 0
  await page.route("https://api.osv.dev/**", async (route) => {
    osvRequests++
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ vulns: [] }) })
  })
  await page.route("https://bundlephobia.com/**", async (route) => {
    bundlephobiaRequests++
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ gzip: 1 }) })
  })

  await page.goto("/")
  const depsTable = page.locator("table.deps").first()
  await expect(depsTable.getByRole("cell", { name: "vue", exact: true })).toBeVisible()

  await expect(depsTable.getByRole("columnheader", { name: "Vulnerabilities" })).toHaveCount(0)
  await expect(depsTable.getByRole("columnheader", { name: "Bundle size (gzip)" })).toHaveCount(0)
  await expect(depsTable.getByRole("columnheader", { name: "Maintainers" })).toHaveCount(0)
  expect(await page.getByLabel("Vulnerabilities", { exact: true }).isChecked()).toBe(false)
  expect(await page.getByLabel("Bundle size (gzip)", { exact: true }).isChecked()).toBe(false)
  expect(await page.getByLabel("Maintainers", { exact: true }).isChecked()).toBe(false)

  expect(osvRequests).toBe(0)
  expect(bundlephobiaRequests).toBe(0)

  // The npm registry and repo-host columns, in contrast, are on by default
  // and their data is already showing.
  await expect(depsTable.getByRole("columnheader", { name: "License" })).toBeVisible()
  await expect(depsTable.getByRole("columnheader", { name: "Git stars" })).toBeVisible()
})

test("Columns, Deps, and Dev Deps sections are collapsible accordions, open by default", async ({ page }) => {
  await page.goto("/")

  const columnsSection = page.locator("details.accordion").nth(0)
  const depsSection = page.locator("details.accordion").nth(1)
  const devDepsSection = page.locator("details.accordion").nth(2)

  await expect(columnsSection).toHaveJSProperty("open", true)
  await expect(depsSection).toHaveJSProperty("open", true)
  await expect(devDepsSection).toHaveJSProperty("open", true)
  await expect(depsSection.locator("table.deps")).toBeVisible()

  // Collapsing Deps hides its table but leaves the other sections alone.
  await depsSection.locator("summary").click()
  await expect(depsSection).toHaveJSProperty("open", false)
  await expect(depsSection.locator("table.deps")).not.toBeVisible()
  await expect(devDepsSection).toHaveJSProperty("open", true)

  // Reopening restores it.
  await depsSection.locator("summary").click()
  await expect(depsSection).toHaveJSProperty("open", true)
  await expect(depsSection.locator("table.deps")).toBeVisible()

  // Same collapse/expand behaviour for the Columns panel.
  await columnsSection.locator("summary").click()
  await expect(columnsSection).toHaveJSProperty("open", false)
  await expect(columnsSection.locator(".column-visibility-panel")).not.toBeVisible()
})

test("loads the app and renders the default package.json dependency table", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByRole("heading", { name: "Package.json info" })).toBeVisible()
  await expect(page.getByRole("cell", { name: "vue", exact: true })).toBeVisible()
})

test("pasting valid package.json JSON replaces the table", async ({ page }) => {
  await page.goto("/")
  const json = JSON.stringify({
    name: "demo",
    dependencies: { "left-pad": "^1.0.0" },
    devDependencies: {},
  })

  await page.getByLabel("Paste package.json content").fill(json)
  await page.getByRole("button", { name: "Load pasted JSON" }).click()

  await expect(page.getByRole("cell", { name: "left-pad", exact: true })).toBeVisible()
})

test("clicking a row's Load button loads that package's package.json as the new input", async ({ page }) => {
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
    })
  })
  await page.route("https://registry.npmjs.org/nested-dep", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ "dist-tags": { latest: "1.0.0" }, time: {} }),
    })
  })

  await page.goto("/")
  const json = JSON.stringify({
    name: "demo",
    dependencies: { "left-pad": "^1.0.0" },
    devDependencies: {},
  })
  await page.getByLabel("Paste package.json content").fill(json)
  await page.getByRole("button", { name: "Load pasted JSON" }).click()

  const depsTable = page.locator("table.deps").first()
  const row = depsTable.locator("tbody tr").filter({ hasText: "left-pad" })
  await row.getByRole("button", { name: "Load" }).click()

  // The table now reflects left-pad's own package.json: its dependency
  // shows up, and left-pad itself is no longer the input's own dependency.
  await expect(depsTable.getByRole("cell", { name: "nested-dep", exact: true })).toBeVisible()
  await expect(depsTable.getByRole("cell", { name: "left-pad", exact: true })).toHaveCount(0)
})

test("back/forward buttons navigate between loaded package.json states", async ({ page }) => {
  await page.goto("/")

  await expect(page.getByText("1 / 1", { exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "← Back" })).toBeDisabled()
  await expect(page.getByRole("button", { name: "Forward →" })).toBeDisabled()

  const json = JSON.stringify({
    name: "demo",
    dependencies: { "history-pkg": "1.0.0" },
    devDependencies: {},
  })
  await page.getByLabel("Paste package.json content").fill(json)
  await page.getByRole("button", { name: "Load pasted JSON" }).click()

  const depsTable = page.locator("table.deps").first()
  await expect(depsTable.getByRole("cell", { name: "history-pkg", exact: true })).toBeVisible()
  await expect(page.getByText("2 / 2", { exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "← Back" })).toBeEnabled()
  await expect(page.getByRole("button", { name: "Forward →" })).toBeDisabled()

  await page.getByRole("button", { name: "← Back" }).click()
  await expect(depsTable.getByRole("cell", { name: "vue", exact: true })).toBeVisible()
  await expect(page.getByText("1 / 2", { exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "← Back" })).toBeDisabled()
  await expect(page.getByRole("button", { name: "Forward →" })).toBeEnabled()

  await page.getByRole("button", { name: "Forward →" }).click()
  await expect(depsTable.getByRole("cell", { name: "history-pkg", exact: true })).toBeVisible()
  await expect(page.getByText("2 / 2", { exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "Forward →" })).toBeDisabled()
})

test("navigating history back and forward reuses cached data instead of refetching", async ({ page }) => {
  let vueRequests = 0
  await page.route("https://registry.npmjs.org/vue", async (route) => {
    vueRequests++
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ "dist-tags": { latest: "3.5.34" }, time: {} }),
    })
  })
  let cachedPkgRequests = 0
  await page.route("https://registry.npmjs.org/cached-history-pkg", async (route) => {
    cachedPkgRequests++
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ "dist-tags": { latest: "1.0.0" }, time: {} }),
    })
  })

  await page.goto("/")
  const depsTable = page.locator("table.deps").first()
  await expect(depsTable.getByRole("cell", { name: "vue", exact: true })).toBeVisible()
  expect(vueRequests).toBe(1)

  const json = JSON.stringify({
    name: "demo",
    dependencies: { "cached-history-pkg": "1.0.0" },
    devDependencies: {},
  })
  await page.getByLabel("Paste package.json content").fill(json)
  await page.getByRole("button", { name: "Load pasted JSON" }).click()
  await expect(depsTable.getByRole("cell", { name: "cached-history-pkg", exact: true })).toBeVisible()
  expect(cachedPkgRequests).toBe(1)

  await page.getByRole("button", { name: "← Back" }).click()
  await expect(depsTable.getByRole("cell", { name: "vue", exact: true })).toBeVisible()
  expect(vueRequests).toBe(1)

  await page.getByRole("button", { name: "Forward →" }).click()
  await expect(depsTable.getByRole("cell", { name: "cached-history-pkg", exact: true })).toBeVisible()
  expect(cachedPkgRequests).toBe(1)
})

test("loading new content while navigated back discards the old forward history", async ({ page }) => {
  await page.goto("/")

  const jsonA = JSON.stringify({ name: "a", dependencies: { "state-a-pkg": "1.0.0" }, devDependencies: {} })
  await page.getByLabel("Paste package.json content").fill(jsonA)
  await page.getByRole("button", { name: "Load pasted JSON" }).click()
  await expect(page.getByText("2 / 2", { exact: true })).toBeVisible()

  await page.getByRole("button", { name: "← Back" }).click()
  await expect(page.getByText("1 / 2", { exact: true })).toBeVisible()

  const jsonB = JSON.stringify({ name: "b", dependencies: { "state-b-pkg": "1.0.0" }, devDependencies: {} })
  await page.getByLabel("Paste package.json content").fill(jsonB)
  await page.getByRole("button", { name: "Load pasted JSON" }).click()

  const depsTable = page.locator("table.deps").first()
  await expect(depsTable.getByRole("cell", { name: "state-b-pkg", exact: true })).toBeVisible()
  await expect(page.getByText("2 / 2", { exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "Forward →" })).toBeDisabled()

  await page.getByRole("button", { name: "← Back" }).click()
  await expect(depsTable.getByRole("cell", { name: "vue", exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "← Back" })).toBeDisabled()
})

test("pasting invalid JSON shows an inline error instead of crashing", async ({ page }) => {
  await page.goto("/")
  await page.getByLabel("Paste package.json content").fill("{ not valid json")
  await page.getByRole("button", { name: "Load pasted JSON" }).click()

  await expect(page.getByRole("alert")).toContainText("not valid JSON")
  await expect(page.getByRole("heading", { name: "Package.json info" })).toBeVisible()
})

test("clicking a column header sorts the table, and clicking again reverses it", async ({ page }) => {
  const weeklyDownloadsByPackage: Record<string, number> = {
    "aaa-pkg": 100,
    "bbb-pkg": 300,
    "ccc-pkg": 200,
  }
  await page.route("https://api.npmjs.org/downloads/point/last-week/**", async (route) => {
    const name = decodeURIComponent(new URL(route.request().url()).pathname.split("/").pop() ?? "")
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ downloads: weeklyDownloadsByPackage[name] ?? 0 }),
    })
  })

  await page.goto("/")
  const json = JSON.stringify({
    name: "demo",
    dependencies: { "ccc-pkg": "^1.0.0", "aaa-pkg": "^1.0.0", "bbb-pkg": "^1.0.0" },
    devDependencies: {},
  })
  await page.getByLabel("Paste package.json content").fill(json)
  await page.getByRole("button", { name: "Load pasted JSON" }).click()

  // Only one populated table (devDependencies is empty), but scope to it
  // explicitly since the empty Dev Deps table also renders a header row.
  const depsTable = page.locator("table.deps").first()
  await expect(depsTable.locator("tbody tr")).toHaveCount(3)

  const packageNameColumn = () => depsTable.locator("tbody tr td:first-child")
  await expect(packageNameColumn()).toHaveText(["ccc-pkg", "aaa-pkg", "bbb-pkg"])

  await depsTable.getByRole("button", { name: /^Weekly downloads/ }).click()
  await expect(packageNameColumn()).toHaveText(["aaa-pkg", "ccc-pkg", "bbb-pkg"])

  await depsTable.getByRole("button", { name: /^Weekly downloads/ }).click()
  await expect(packageNameColumn()).toHaveText(["bbb-pkg", "ccc-pkg", "aaa-pkg"])
})

test("the search box filters the table by package name", async ({ page }) => {
  await page.goto("/")
  const json = JSON.stringify({
    name: "demo",
    dependencies: { "react": "^18.0.0", "react-dom": "^18.0.0", "vue": "^3.0.0" },
    devDependencies: {},
  })
  await page.getByLabel("Paste package.json content").fill(json)
  await page.getByRole("button", { name: "Load pasted JSON" }).click()

  // DependenciesTable renders its search box and table as sibling root
  // nodes (no wrapping element), so scope to the first "Search by name"
  // box specifically - it precedes the Deps table in DOM order.
  const depsTable = page.locator("table.deps").first()
  const depsSearchInput = page.locator(".table-controls").first().getByLabel("Search by name")
  await expect(depsTable.locator("tbody tr")).toHaveCount(3)

  await depsSearchInput.fill("react")
  await expect(depsTable.locator("tbody tr td:first-child")).toHaveText(["react", "react-dom"])

  await depsSearchInput.fill("no-such-package")
  await expect(depsTable.locator("tbody tr")).toHaveCount(0)

  await depsSearchInput.fill("")
  await expect(depsTable.locator("tbody tr")).toHaveCount(3)
})

test("renders license, outdated, deprecated, vulnerability, bundle size, and maintainer data", async ({ page }) => {
  await page.route("https://registry.npmjs.org/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        "dist-tags": { latest: "2.0.0" },
        time: { "1.0.0": "2023-01-01T00:00:00.000Z", "2.0.0": "2024-01-01T00:00:00.000Z", modified: "2024-06-01T00:00:00.000Z" },
        maintainers: [{ name: "alice" }, { name: "bob" }],
        versions: {
          "1.0.0": { license: "GPL-3.0", deprecated: "please upgrade" },
        },
      }),
    })
  })
  await page.route("https://api.osv.dev/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ vulns: [{ id: "GHSA-xxxx-xxxx-xxxx" }] }),
    })
  })
  await page.route("https://bundlephobia.com/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ gzip: 2048 }),
    })
  })

  await page.goto("/")
  const json = JSON.stringify({
    name: "demo",
    dependencies: { "enriched-pkg": "1.0.0" },
    devDependencies: {},
  })
  await page.getByLabel("Paste package.json content").fill(json)
  await page.getByRole("button", { name: "Load pasted JSON" }).click()

  // Vulnerabilities, Bundle size, and Maintainers are hidden by default;
  // opt into them to check their data too.
  await page.getByLabel("Vulnerabilities", { exact: true }).check()
  await page.getByLabel("Bundle size (gzip)", { exact: true }).check()
  await page.getByLabel("Maintainers", { exact: true }).check()

  const depsTable = page.locator("table.deps").first()
  const row = depsTable.locator("tbody tr").filter({ hasText: "enriched-pkg" })

  await expect(row.getByRole("cell", { name: "GPL-3.0 ⚠", exact: true })).toBeVisible()
  await expect(row.getByRole("cell", { name: "Yes", exact: true })).toBeVisible()
  await expect(row.getByRole("cell", { name: "please upgrade", exact: true })).toBeVisible()
  await expect(row.getByRole("cell", { name: "1", exact: true })).toBeVisible()
  await expect(row.getByRole("cell", { name: "2.0 KB", exact: true })).toBeVisible()
  await expect(row.getByRole("cell", { name: "alice, bob", exact: true })).toBeVisible()
})

test("hiding a column skips its network request, and re-showing it fetches the missing data", async ({ page }) => {
  const osvRequestedNames: string[] = []
  await page.route("https://api.osv.dev/v1/query", async (route) => {
    const body = route.request().postDataJSON() as { package: { name: string } }
    osvRequestedNames.push(body.package.name)
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ vulns: [{ id: "GHSA-test" }] }),
    })
  })
  await page.route("https://registry.npmjs.org/gated-pkg", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ "dist-tags": { latest: "1.0.0" }, time: {} }),
    })
  })

  await page.goto("/")

  // Hide the Vulnerabilities column before loading the package under test.
  await page.getByLabel("Vulnerabilities", { exact: true }).uncheck()

  const json = JSON.stringify({
    name: "demo",
    dependencies: { "gated-pkg": "1.0.0" },
    devDependencies: {},
  })
  await page.getByLabel("Paste package.json content").fill(json)
  await page.getByRole("button", { name: "Load pasted JSON" }).click()

  const depsTable = page.locator("table.deps").first()
  await expect(depsTable.getByRole("cell", { name: "gated-pkg", exact: true })).toBeVisible()

  expect(osvRequestedNames).not.toContain("gated-pkg")
  await expect(depsTable.getByRole("columnheader", { name: "Vulnerabilities" })).toHaveCount(0)

  // Re-showing the column should fetch the data that was never requested.
  await page.getByLabel("Vulnerabilities", { exact: true }).check()

  const row = depsTable.locator("tbody tr").filter({ hasText: "gated-pkg" })
  await expect(row.getByRole("cell", { name: "1", exact: true })).toBeVisible()
  expect(osvRequestedNames).toContain("gated-pkg")
})

test("the column visibility panel hides/shows columns and never drops below the floor", async ({ page }) => {
  await page.goto("/")
  const depsTable = page.locator("table.deps").first()

  await expect(depsTable.getByRole("columnheader", { name: "License" })).toBeVisible()

  await page.getByLabel("License", { exact: true }).uncheck()
  await expect(depsTable.getByRole("columnheader", { name: "License" })).toHaveCount(0)

  await page.getByLabel("License", { exact: true }).check()
  await expect(depsTable.getByRole("columnheader", { name: "License" })).toBeVisible()

  // Hide every toggleable column except "Version" to hit the floor: Name
  // and Load are always visible, so this should bottom out at those two
  // plus Version (three total), not fewer.
  const allLabels = (await page.locator(".column-visibility-panel label").allTextContents()).map((t) =>
    t.trim()
  )
  for (const label of allLabels) {
    if (label === "Version") continue
    await page.getByLabel(label, { exact: true }).uncheck()
  }

  await expect(page.getByLabel("Version", { exact: true })).toBeDisabled()
  await expect(depsTable.getByRole("columnheader", { name: "Name" })).toBeVisible()
  await expect(depsTable.getByRole("columnheader", { name: "Version", exact: true })).toBeVisible()
  await expect(depsTable.getByRole("columnheader", { name: "Load" })).toBeVisible()
  await expect(depsTable.locator("thead th")).toHaveCount(3)
})
