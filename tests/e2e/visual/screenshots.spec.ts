import { test } from "@playwright/test";
import { mockExternalApis, loadJson, expandAllSections } from "../helpers";

/**
 * Not part of the regular e2e suite (this file lives outside playwright
 * .config.ts's testDir, so `npm run test:e2e` never picks it up). Run it on
 * demand with `npm run screenshots` whenever you want a quick visual look
 * at the current UI - handy while tweaking styles, since you can just open
 * the PNGs in ./screenshots/ instead of running the app yourself.
 */

test.beforeEach(async ({ page }) => {
    await mockExternalApis(page);
});

test("default view - fresh load, Deps/Dev Deps collapsed", async ({ page }) => {
    await page.goto("/");
    await page.screenshot({ path: "screenshots/01-default.png", fullPage: true });
});

test("deps expanded - small package.json, both tables open", async ({ page }) => {
    await page.goto("/");
    await expandAllSections(page);
    await loadJson(page, {
        name: "demo",
        dependencies: { "left-pad": "^1.0.0", react: "^18.0.0" },
        devDependencies: { vite: "^5.0.0" },
    });
    await page.getByRole("cell", { name: "left-pad", exact: true }).waitFor();
    await page.screenshot({ path: "screenshots/02-deps-expanded.png", fullPage: true });
});

test("error state - invalid JSON pasted from clipboard", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/");
    await page.evaluate(() => navigator.clipboard.writeText("{ not valid json"));
    await page.getByRole("button", { name: "Paste from clipboard" }).click();
    await page.getByRole("alert").waitFor();
    await page.screenshot({ path: "screenshots/03-error-state.png", fullPage: true });
});

test("narrow viewport - default view at mobile width", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.screenshot({ path: "screenshots/04-narrow-viewport.png", fullPage: true });
});

test("package.json viewer expanded - vue-json-pretty tree view", async ({ page }) => {
    await page.goto("/");
    await page.locator("details.accordion").last().locator("summary").click();
    await page.getByText('"dependencies"').waitFor();
    await page.screenshot({ path: "screenshots/05-json-viewer.png", fullPage: true });
});

async function openColumnsPanel(page) {
    await page.goto("/");
    await page.locator("summary", { hasText: "Columns" }).click();
    await page.locator(".column-visibility-panel").waitFor();
}

test("columns panel - normal width, single grid", async ({ page }) => {
    await page.setViewportSize({ width: 600, height: 900 });
    await openColumnsPanel(page);
    await page.screenshot({ path: "screenshots/06-columns-panel-normal.png", fullPage: true });
});

test("columns panel - mid-size desktop, two grids", async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 900 });
    await openColumnsPanel(page);
    await page.screenshot({ path: "screenshots/07-columns-panel-mid-desktop.png", fullPage: true });
});

test("columns panel - large desktop, three grids", async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await openColumnsPanel(page);
    await page.screenshot({
        path: "screenshots/08-columns-panel-large-desktop.png",
        fullPage: true,
    });
});
