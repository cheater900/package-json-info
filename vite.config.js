import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";

// https://vite.dev/config/
export default defineConfig({
    plugins: [vue()],
    // Pre-bundling vue-json-pretty's ESM build alongside vuedraggable (which
    // is UMD-only, so it enters the scan through a different "vue"
    // resolution condition) makes esbuild's dependency optimizer split
    // Vue's runtime into separate reactivity/runtime-core/runtime-dom/
    // shared chunks and drop a cross-chunk import for two of
    // vue-json-pretty's required init functions ("init_runtime_dom_esm_
    // bundler is not defined"). vue-json-pretty's ESM file is already
    // plain, browser-loadable ESM (a bare `import * as vue from "vue"`),
    // so excluding it from pre-bundling avoids that chunk-splitting
    // entirely - Vite just serves it unbundled, with its own "vue" import
    // resolved against vue's normal (unsplit) optimized chunk.
    optimizeDeps: {
        exclude: ["vue-json-pretty"],
    },
    // SSR build = CLI bundle (npm run build:cli): web app icons do not belong in it.
    environments: {
        ssr: { build: { copyPublicDir: false } },
    },
    test: {
        restoreMocks: true,
        unstubGlobals: true,
        projects: [
            {
                // Node, not jsdom: proves core runs outside the browser.
                extends: true,
                test: {
                    name: "core",
                    environment: "node",
                    setupFiles: ["tests/helpers/coreSetup.ts"],
                    include: ["tests/unit/core/**/*.test.ts"],
                },
            },
            {
                extends: true,
                test: {
                    name: "cli",
                    environment: "node",
                    setupFiles: ["tests/helpers/coreSetup.ts", "tests/helpers/cliSetup.ts"],
                    include: ["tests/unit/cli/**/*.test.ts"],
                },
            },
            {
                extends: true,
                test: {
                    name: "app",
                    environment: "jsdom",
                    setupFiles: ["tests/helpers/appSetup.ts"],
                    include: ["tests/unit/app/**/*.test.ts", "tests/integration/**/*.test.ts"],
                },
            },
        ],
    },
});
