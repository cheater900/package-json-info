import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    reporter: "list",
    use: {
        baseURL: "http://localhost:4173",
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
        command: "npm run dev -- --port 4173 --strictPort",
        url: "http://localhost:4173",
        reuseExistingServer: !process.env.CI,
        timeout: 30000,
    },
});
