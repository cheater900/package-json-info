import { defineConfig, devices } from "@playwright/test";

const DEV_SERVER_PORT = 4173;
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`;
const DEV_SERVER_START_TIMEOUT_MS = 30_000;

export default defineConfig({
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    reporter: "list",
    use: {
        baseURL: DEV_SERVER_URL,
        trace: "on-first-retry",
    },
    // Two projects, two test directories, so `playwright test` (no
    // --project flag) doesn't run both by default: `npm run test:e2e`
    // targets chromium/e2e explicitly, `npm run screenshots` targets
    // screenshots/visual explicitly.
    projects: [
        {
            name: "chromium",
            testDir: "./tests/e2e",
            testIgnore: "**/visual/**",
            use: { ...devices["Desktop Chrome"] },
        },
        {
            name: "screenshots",
            testDir: "./tests/e2e/visual",
            use: { ...devices["Desktop Chrome"] },
        },
    ],
    webServer: {
        command: `npm run dev -- --port ${DEV_SERVER_PORT} --strictPort`,
        url: DEV_SERVER_URL,
        reuseExistingServer: !process.env.CI,
        timeout: DEV_SERVER_START_TIMEOUT_MS,
    },
});
