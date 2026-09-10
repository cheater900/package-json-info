<template>
    <div>
        <h1>Package.json info</h1>

        <div v-if="loadError" class="banner banner-error" role="alert">
            {{ loadError }}
        </div>
        <div v-if="isLoadingInput" class="banner banner-loading">Loading package.json…</div>

        <section class="input-methods">
            <form class="url-fetch-row" @submit.prevent="fetchFromUrlInput">
                <label for="url-input" class="visually-hidden">
                    Enter a package.json URL, or a GitHub/GitLab/Codeberg repo URL
                </label>
                <input id="url-input" v-model="urlInput" type="text" placeholder="Enter url..." />
                <button type="submit" :disabled="isLoadingInput">FETCH</button>
            </form>

            <div class="input-method-actions">
                <input
                    ref="fileInputRef"
                    class="hidden-file-input"
                    type="file"
                    accept=".json,application/json"
                    @change="onFileSelected"
                />
                <button type="button" @click="fileInputRef?.click()" :disabled="isLoadingInput">
                    Upload file
                </button>
                <button type="button" @click="loadFromClipboard" :disabled="isLoadingInput">
                    Paste from clipboard
                </button>
            </div>
        </section>

        <details class="accordion">
            <summary>Columns</summary>
            <column-visibility-panel
                :visible-columns="visibleColumns"
                :column-order="columnOrder"
                @toggle-column="toggleColumn"
            />
        </details>

        <section v-if="history.length > 1" class="history-controls">
            <button type="button" @click="goBack" :disabled="!canGoBack">← Back</button>
            <span>{{ historyIndex + 1 }} / {{ history.length }}</span>
            <button type="button" @click="goForward" :disabled="!canGoForward">Forward →</button>
        </section>

        <div class="search-shrink-row">
            <div class="search-controls">
                <label :for="searchInputId" class="visually-hidden">Search by name</label>
                <input
                    :id="searchInputId"
                    v-model="searchQuery"
                    type="text"
                    placeholder="Filter by package name"
                />
            </div>

            <div class="shrink-labels-controls">
                <label>
                    <input type="checkbox" v-model="shrinkColumnLabels" />
                    Shrink columns by abbreviation
                </label>
            </div>
        </div>

        <h2 v-if="pkg?.name" class="package-name">{{ pkg.name }}</h2>

        <details class="accordion">
            <summary>
                Deps
                <span v-if="isLoadingDeps">(loading…)</span>
            </summary>
            <dependencies-table
                :dependencies="deps"
                :visible-columns="visibleColumns"
                :column-order="columnOrder"
                :search-query="searchQuery"
                :column-labels="columnLabels"
                :column-titles="columnTitles"
                :is-loading="isLoadingDeps"
                @load-package="onLoadPackage"
                @reorder-columns="reorderColumns"
            />
        </details>

        <details class="accordion">
            <summary>
                Dev Deps
                <span v-if="isLoadingDevDeps">(loading…)</span>
            </summary>
            <dependencies-table
                :dependencies="devDeps"
                :visible-columns="visibleColumns"
                :column-order="columnOrder"
                :search-query="searchQuery"
                :column-labels="columnLabels"
                :column-titles="columnTitles"
                :is-loading="isLoadingDevDeps"
                @load-package="onLoadPackage"
                @reorder-columns="reorderColumns"
            />
        </details>
        <details class="accordion">
            <summary>package.json</summary>
            <vue-json-pretty :data="pkg" show-icon show-line-number show-length />
        </details>
    </div>
</template>
<script lang="ts" setup>
import { ref, watch, useId } from "vue";
import { fetchPackageJsonForVersion } from "./utils/npmPackage.ts";
import { fetchPackageJsonFromRepo, isRepoHostUrl } from "./utils/repoPackageJson.ts";
import { readInputUrlParam, withInputUrlParam } from "./utils/urlInputSync.ts";
import { useColumnPreferences } from "./composables/useColumnPreferences.ts";
import { usePackageJsonHistory } from "./composables/usePackageJsonHistory.ts";
import DependenciesTable from "./components/DependenciesTable.vue";
import ColumnVisibilityPanel from "./components/ColumnVisibilityPanel.vue";
import VueJsonPretty from "vue-json-pretty";
import "vue-json-pretty/lib/styles.css";
import packageJson from "../package.json";

const isLoadingInput = ref(false);

// Kept in sync with the ?inputUrl= query param: read on load, written back
// (via replaceState, so typing doesn't spam browser history) on every
// change. Lets the URL-fetch input's text be shared/bookmarked/reloaded.
const urlInput = ref(readInputUrlParam(window.location.search));
const fileInputRef = ref(null);

watch(urlInput, (value) => {
    const search = withInputUrlParam(window.location.search, value);
    const url = `${window.location.pathname}${search}${window.location.hash}`;
    window.history.replaceState(null, "", url);
});

// Shared by both the Deps and Dev Deps tables, so one search box filters
// both simultaneously.
const searchInputId = useId();
const searchQuery = ref("");

const {
    visibleColumns,
    columnOrder,
    shrinkColumnLabels,
    columnLabels,
    columnTitles,
    toggleColumn,
    reorderColumns,
} = useColumnPreferences();

const {
    pkg,
    deps,
    devDeps,
    isLoadingDeps,
    isLoadingDevDeps,
    loadError,
    history,
    historyIndex,
    canGoBack,
    canGoForward,
    goBack,
    goForward,
    loadPackageJsonText,
} = usePackageJsonHistory(visibleColumns);

async function loadFromClipboard() {
    loadError.value = null;
    try {
        const text = await navigator.clipboard.readText();
        loadPackageJsonText(text);
    } catch (err) {
        loadError.value =
            "Could not read the clipboard. Check the browser's clipboard permission and try again.";
    }
}

function onFileSelected(event) {
    const file = event.target.files?.[0];
    if (!file) {
        return;
    }
    const reader = new FileReader();
    reader.onload = () => loadPackageJsonText(String(reader.result));
    reader.onerror = () => {
        loadError.value = "Failed to read the selected file.";
    };
    reader.readAsText(file);
}

/**
 * Fetches the single URL input's content, routing between a repo host
 * (GitHub/GitLab/Codeberg - resolved via fetchPackageJsonFromRepo, which
 * locates package.json on the repo's default branch) and any other URL
 * (fetched directly as the package.json content).
 */
async function fetchFromUrlInput() {
    isLoadingInput.value = true;
    loadError.value = null;
    try {
        const url = urlInput.value;
        const content = isRepoHostUrl(url)
            ? await fetchPackageJsonFromRepo(url)
            : await fetchUrlAsText(url);
        if (!content) {
            throw new Error("Could not find a package.json at that URL.");
        }
        loadPackageJsonText(content);
    } catch (err) {
        loadError.value = err.message;
    } finally {
        isLoadingInput.value = false;
    }
}

async function fetchUrlAsText(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
    }
    return response.text();
}

async function onLoadPackage({ name, version }) {
    isLoadingInput.value = true;
    loadError.value = null;
    try {
        const content = await fetchPackageJsonForVersion(name, version);
        if (!content) {
            throw new Error(`Could not find package.json data for "${name}".`);
        }
        loadPackageJsonText(content);
    } catch (err) {
        loadError.value = err.message;
    } finally {
        isLoadingInput.value = false;
    }
}

// Bootstrap with this app's own package.json as the first history entry.
loadPackageJsonText(JSON.stringify(packageJson, null, 2));
</script>

<style>
#app {
    padding: 32px;
    text-align: left;
}

h1 {
    text-align: center;
    text-transform: uppercase;
}

input,
textarea {
    display: block;
    box-sizing: border-box;
}

.banner {
    padding: 8px 12px;
    border-radius: 4px;
    margin-bottom: 16px;
    font-weight: 600;
    word-wrap: break-word;
}

.banner-error {
    background: #fdecea;
    color: #611a15;
    border: 1px solid #f5c6cb;
}

.banner-loading {
    background: var(--code-bg, #f4f3ec);
    color: var(--text, #6b6375);
}

.input-methods {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 24px;
}

.url-fetch-row {
    display: flex;
    gap: 8px;
    flex: 1;
}

.url-fetch-row input {
    flex: 1;
}

.input-method-actions {
    display: flex;
    gap: 8px;
}

.hidden-file-input {
    display: none;
}

.visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
}

.history-controls {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
}

.search-shrink-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
    position: sticky;
    top: 0;
    background: var(--bg, #fff);
    padding: 8px 0;
    z-index: 2;
}

.search-controls {
    display: flex;
    align-items: center;
    gap: 8px;
}

.shrink-labels-controls label {
    display: flex;
    align-items: center;
    gap: 4px;
}

.accordion {
    margin-bottom: 16px;
}

.accordion > summary {
    cursor: pointer;
    font-weight: 600;
    padding: 8px 4px;
}

.package-name {
    font-weight: 700;
    margin: 24px 0 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--border, #e5e4e7);
}

button {
    padding: 6px 14px;
    font-size: 0.95rem;
}
</style>
