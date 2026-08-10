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
}

test.beforeEach(async ({ page }) => {
  await mockExternalApis(page)
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
