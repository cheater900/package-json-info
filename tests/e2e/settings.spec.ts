import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { mockExternalApis, loadJson } from "./helpers";
import {
    GITHUB_API_URL,
    GITHUB_RATE_LIMIT_URL,
    STORAGE_KEY_GITHUB_TOKEN,
} from "../../src/constants";
import {
    githubRateLimitBody,
    githubRateLimitText,
    githubTokenFixture as TOKEN,
} from "../fixtures/github";

test.beforeEach(async ({ page }) => {
    await mockExternalApis(page);
    await page.route(GITHUB_RATE_LIMIT_URL, async (route) => {
        await route.fulfill({ json: githubRateLimitBody });
    });
});

function gear(page: Page) {
    return page.getByRole("button", { name: /^Open settings/ });
}

async function saveToken(page: Page) {
    await gear(page).click();
    await page.getByLabel("Personal access token").fill(TOKEN);
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("status")).toHaveText("Token saved.");
}

test("gear opens settings, Esc closes and refocuses gear", async ({ page }) => {
    await page.goto("/");
    const dialog = page.getByRole("dialog", { name: "Settings" });
    await expect(dialog).toBeHidden();

    await gear(page).click();
    await expect(dialog).toBeVisible();
    await expect(gear(page)).toHaveAttribute("aria-expanded", "true");

    await page.getByLabel("Personal access token").focus();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(gear(page)).toBeFocused();
    await expect(gear(page)).toHaveAttribute("aria-expanded", "false");
});

test("saved token authorizes GitHub, survives reload, purges", async ({ page }) => {
    await page.goto("/");
    await saveToken(page);

    await expect(
        page.getByRole("button", { name: "Open settings (GitHub token set)" }),
    ).toBeVisible();
    const stored = await page.evaluate(
        (key) => localStorage.getItem(key),
        STORAGE_KEY_GITHUB_TOKEN,
    );
    expect(stored).toBeTruthy();
    expect(stored).not.toContain(TOKEN);

    await page.keyboard.press("Escape");
    const githubRequest = page.waitForRequest(`${GITHUB_API_URL}/repos/example-org/fresh-pkg`);
    await loadJson(page, { name: "demo", dependencies: { "fresh-pkg": "1.0.0" } });
    expect((await githubRequest).headers().authorization).toBe(`Bearer ${TOKEN}`);

    await page.reload();
    await expect(
        page.getByRole("button", { name: "Open settings (GitHub token set)" }),
    ).toBeVisible();

    await gear(page).click();
    await page.getByRole("button", { name: "Purge" }).click();
    await expect(page.getByRole("status")).toHaveText("Token purged.");
    await expect(gear(page)).toHaveAccessibleName("Open settings");
    expect(
        await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY_GITHUB_TOKEN),
    ).toBeNull();
});

test("mounts despite stored token when IndexedDB open hangs", async ({ page }) => {
    await page.addInitScript((key) => {
        localStorage.setItem(key, JSON.stringify({ iv: [1], data: [1] }));
        indexedDB.open = () => ({}) as IDBOpenDBRequest;
    }, STORAGE_KEY_GITHUB_TOKEN);

    await page.goto("/");

    await expect(gear(page)).toHaveAccessibleName("Open settings");
});

test("verify shows remaining / limit", async ({ page }) => {
    await page.goto("/");
    await saveToken(page);

    await page.getByRole("button", { name: "Verify" }).click();

    await expect(page.getByRole("status")).toHaveText(
        `${githubRateLimitText} requests left this hour`,
    );
});

function rootBackground(page: Page) {
    return page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
}

test("Light theme changes background, persists across reload", async ({ page }) => {
    await page.goto("/");
    const greenBackground = await rootBackground(page);

    await gear(page).click();
    await page.getByLabel("Theme").selectOption("light");

    const lightBackground = await rootBackground(page);
    expect(lightBackground).not.toBe(greenBackground);
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    expect(await rootBackground(page)).toBe(lightBackground);
});

test("System theme follows OS color scheme", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    await gear(page).click();
    await page.getByLabel("Theme").selectOption("light");
    const lightBackground = await rootBackground(page);

    await page.getByLabel("Theme").selectOption("system");
    expect(await rootBackground(page)).toBe(lightBackground);

    await page.emulateMedia({ colorScheme: "dark" });
    expect(await rootBackground(page)).not.toBe(lightBackground);
});

test("font size scales root font", async ({ page }) => {
    await page.goto("/");
    await gear(page).click();

    await page.getByLabel("Font size").selectOption("125%");

    const fontSize = await page.evaluate(() => getComputedStyle(document.documentElement).fontSize);
    expect(fontSize).toBe("22.5px");
});
