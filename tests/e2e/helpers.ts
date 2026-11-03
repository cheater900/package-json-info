import type { Page } from "@playwright/test";
import {
    BUNDLEPHOBIA_SIZE_URL,
    GITHUB_API_URL,
    GITHUB_RAW_URL,
    LOOKUP_DB_NAME,
    LOOKUP_DB_STORE,
    NPM_REGISTRY_URL,
    NPM_WEEKLY_DOWNLOADS_URL,
    OSV_QUERY_URL,
    PNPM_WORKSPACE_FILE,
} from "../../src/constants";

/**
 * The app talks to the real npm registry, npm downloads API, and GitHub API.
 * Route every one of those through canned responses so tests run fully
 * offline and aren't at the mercy of rate limits or flaky third parties.
 */
export async function mockExternalApis(page: Page) {
    await page.route(`${NPM_REGISTRY_URL}/**`, async (route) => {
        const name = decodeURIComponent(new URL(route.request().url()).pathname.slice(1));
        await route.fulfill({
            json: {
                "dist-tags": { latest: "9.9.9" },
                time: { "9.9.9": "2024-01-01T00:00:00.000Z", modified: "2024-06-01T00:00:00.000Z" },
                repository: { type: "git", url: `git+https://github.com/example-org/${name}.git` },
                versions: { "9.9.9": { dependencies: {} } },
            },
        });
    });

    await page.route(`${NPM_WEEKLY_DOWNLOADS_URL}/**`, async (route) => {
        await route.fulfill({ json: { downloads: 12345 } });
    });

    await page.route(`${GITHUB_API_URL}/repos/**`, async (route) => {
        await route.fulfill({ json: { stargazers_count: 42 } });
    });

    await page.route(`${GITHUB_API_URL}/search/issues**`, async (route) => {
        await route.fulfill({ json: { total_count: 3 } });
    });

    // Probed for every GitHub repo URL without a `workspaces` field.
    await page.route(`${GITHUB_RAW_URL}/**/${PNPM_WORKSPACE_FILE}`, async (route) => {
        await route.fulfill({ status: 404 });
    });

    await page.route(OSV_QUERY_URL, async (route) => {
        await route.fulfill({ json: { vulns: [] } });
    });

    await page.route(`${BUNDLEPHOBIA_SIZE_URL}**`, async (route) => {
        await route.fulfill({ json: { gzip: 1024 } });
    });
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
    });
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
        const section = page.locator("details.accordion").nth(index);
        const isOpen = await section.evaluate((el) => (el as HTMLDetailsElement).open);
        if (!isOpen) {
            await section.locator("summary").click();
        }
    }
}

/**
 * True once the offline lookup store holds `recordKey` (`kind:key`). Opens
 * the database the way the app does, so a first open still creates the store.
 */
export function hasStoredLookup(page: Page, recordKey: string) {
    return page.evaluate(
        ([dbName, storeName, key]) =>
            new Promise<boolean>((resolve, reject) => {
                const openRequest = indexedDB.open(dbName);
                openRequest.onupgradeneeded = () => openRequest.result.createObjectStore(storeName);
                openRequest.onerror = () => reject(openRequest.error);
                openRequest.onsuccess = () => {
                    const db = openRequest.result;
                    const getRequest = db.transaction(storeName).objectStore(storeName).get(key);
                    getRequest.onsuccess = () => {
                        db.close();
                        resolve(getRequest.result !== undefined);
                    };
                };
            }),
        [LOOKUP_DB_NAME, LOOKUP_DB_STORE, recordKey],
    );
}

/** Types `url` into the URL input and submits it. */
export async function fetchFromUrlInput(page: Page, url: string) {
    await page
        .getByLabel("Enter a package.json URL, or a GitHub/GitLab/Codeberg repo URL")
        .fill(url);
    await page.getByRole("button", { name: "FETCH" }).click();
}

/** Package name in the "Showing dependencies for" line. */
export function shownPackageName(page: Page) {
    return page.locator(".package-name .inline-pre");
}
