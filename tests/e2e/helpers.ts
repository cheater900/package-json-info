import type { Page } from "@playwright/test"

/**
 * The app talks to the real npm registry, npm downloads API, and GitHub API.
 * Route every one of those through canned responses so tests run fully
 * offline and aren't at the mercy of rate limits or flaky third parties.
 */
export async function mockExternalApis(page: Page) {
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

/**
 * Loads arbitrary JSON as the app's input via the file-upload control (the
 * hidden <input type="file"> still accepts setInputFiles regardless of its
 * own visibility). A fast, permission-free way to get a package.json into
 * the app for tests/scripts that aren't themselves about a specific input
 * method.
 */
export async function loadJson(page: Page, data: unknown) {
  await page.locator('input[type="file"]').setInputFiles({
    name: "package.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(data)),
  })
}

/**
 * Columns, Deps, and Dev Deps all start collapsed; expand them so their
 * content (checkboxes, table rows) is visible/interactable. The
 * accordions' open state is plain DOM state, independent of the loaded
 * package.json, so one call (right after page.goto) covers everything
 * done afterwards.
 */
export async function expandAllSections(page: Page) {
  for (const index of [0, 1, 2]) {
    const section = page.locator("details.accordion").nth(index)
    const isOpen = await section.evaluate((el) => (el as HTMLDetailsElement).open)
    if (!isOpen) {
      await section.locator("summary").click()
    }
  }
}
