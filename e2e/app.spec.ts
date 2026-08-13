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

  const depsTable = page.locator("table.deps").first()
  const row = depsTable.locator("tbody tr").filter({ hasText: "enriched-pkg" })

  await expect(row.getByRole("cell", { name: "GPL-3.0 ⚠", exact: true })).toBeVisible()
  await expect(row.getByRole("cell", { name: "Yes", exact: true })).toBeVisible()
  await expect(row.getByRole("cell", { name: "please upgrade", exact: true })).toBeVisible()
  await expect(row.getByRole("cell", { name: "1", exact: true })).toBeVisible()
  await expect(row.getByRole("cell", { name: "2.0 KB", exact: true })).toBeVisible()
  await expect(row.getByRole("cell", { name: "alice, bob", exact: true })).toBeVisible()
})

test("the column visibility panel hides/shows columns and never drops below two visible", async ({ page }) => {
  await page.goto("/")
  const depsTable = page.locator("table.deps").first()

  await expect(depsTable.getByRole("columnheader", { name: "License" })).toBeVisible()

  await page.getByLabel("License", { exact: true }).uncheck()
  await expect(depsTable.getByRole("columnheader", { name: "License" })).toHaveCount(0)

  await page.getByLabel("License", { exact: true }).check()
  await expect(depsTable.getByRole("columnheader", { name: "License" })).toBeVisible()

  // Hide every toggleable column except "Version" to hit the two-column floor.
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
  await expect(depsTable.locator("thead th")).toHaveCount(2)
})
