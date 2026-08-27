import { test } from "@playwright/test"
import { mockExternalApis, loadJson, expandAllSections } from "../e2e/helpers"

/**
 * Not part of the regular e2e suite (this file lives outside playwright
 * .config.ts's testDir, so `npm run test:e2e` never picks it up). Run it on
 * demand with `npm run screenshots` whenever you want a quick visual look
 * at the current UI - handy while tweaking styles, since you can just open
 * the PNGs in ./screenshots/ instead of running the app yourself.
 */

test.beforeEach(async ({ page }) => {
  await mockExternalApis(page)
})

test("default view - fresh load, Deps/Dev Deps collapsed", async ({ page }) => {
  await page.goto("/")
  await page.screenshot({ path: "screenshots/01-default.png", fullPage: true })
})

test("deps expanded - a small package.json loaded, both tables open", async ({ page }) => {
  await page.goto("/")
  await expandAllSections(page)
  await loadJson(page, {
    name: "demo",
    dependencies: { "left-pad": "^1.0.0", "react": "^18.0.0" },
    devDependencies: { "vite": "^5.0.0" },
  })
  await page.getByRole("cell", { name: "left-pad", exact: true }).waitFor()
  await page.screenshot({ path: "screenshots/02-deps-expanded.png", fullPage: true })
})

test("error state - invalid JSON pasted from clipboard", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"])
  await page.goto("/")
  await page.evaluate(() => navigator.clipboard.writeText("{ not valid json"))
  await page.getByRole("button", { name: "Paste from clipboard" }).click()
  await page.getByRole("alert").waitFor()
  await page.screenshot({ path: "screenshots/03-error-state.png", fullPage: true })
})

test("narrow viewport - default view at mobile width", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto("/")
  await page.screenshot({ path: "screenshots/04-narrow-viewport.png", fullPage: true })
})
