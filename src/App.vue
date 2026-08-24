<template>
  <div>
    <h1>Package.json info</h1>

    <div v-if="loadError" class="banner banner-error" role="alert">
      {{ loadError }}
    </div>
    <div v-if="isLoadingInput" class="banner banner-loading">
      Loading package.json…
    </div>

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

    <section class="history-controls">
      <button type="button" @click="goBack" :disabled="!canGoBack">← Back</button>
      <span>{{ historyIndex + 1 }} / {{ history.length }}</span>
      <button type="button" @click="goForward" :disabled="!canGoForward">Forward →</button>
    </section>

    <details class="accordion" open>
      <summary>Columns</summary>
      <column-visibility-panel
        :hidden-columns="hiddenColumns"
        @toggle-column="onToggleColumn"
      />
    </details>

    <details class="accordion">
      <summary>Deps<span v-if="isLoadingDeps"> (loading…)</span></summary>
      <dependencies-table
        :dependencies="deps"
        :hidden-columns="hiddenColumns"
        @load-package="onLoadPackage"
      />
    </details>

    <details class="accordion">
      <summary>Dev Deps<span v-if="isLoadingDevDeps"> (loading…)</span></summary>
      <dependencies-table
        :dependencies="devDeps"
        :hidden-columns="hiddenColumns"
        @load-package="onLoadPackage"
      />
    </details>
    <div>
      <pre>{{ packageJsonContent }}</pre>
    </div>
  </div>
</template>
<script lang="ts" setup>
import { ref, computed, watch } from "vue";
import { fetchPackagesInfo, fetchPackageJsonForVersion } from "./utils/npmPackage.ts"
import { fetchPackageJsonFromRepo, isRepoHostUrl } from "./utils/repoPackageJson.ts"
import { toggleColumnVisibility, DEFAULT_HIDDEN_COLUMNS } from "./utils/tableColumns.ts"
import {
  createHistoryEntry,
  pushHistoryEntry,
  canGoBack as canGoBackPure,
  canGoForward as canGoForwardPure,
  isEntryCacheValid,
} from "./utils/packageJsonHistory.ts"
import DependenciesTable from "./components/DependenciesTable.vue"
import ColumnVisibilityPanel from "./components/ColumnVisibilityPanel.vue"
import packageJson from '../package.json'

const packageJsonContent = ref("")
const pkg = ref(null)

const loadError = ref(null)
const isLoadingInput = ref(false)
const isLoadingDeps = ref(false)
const isLoadingDevDeps = ref(false)

const urlInput = ref("")
const fileInputRef = ref(null)

const deps = ref([])
const devDeps = ref([])

const hiddenColumns = ref(new Set(DEFAULT_HIDDEN_COLUMNS))

// Each loaded package.json becomes a history entry, caching its own
// fetched deps/devDeps. Navigating back/forward restores an entry's cached
// data directly (no request) when it's still valid for the current
// hiddenColumns; otherwise (never fetched, or fetched under a different
// column set) it fetches - but even then, npmPackage's own name/slug-level
// caching means only genuinely new data triggers a request.
const history = ref([])
const historyIndex = ref(-1)

const canGoBack = computed(() => canGoBackPure(historyIndex.value))
const canGoForward = computed(() => canGoForwardPure(history.value, historyIndex.value))

function onToggleColumn(key) {
  hiddenColumns.value = toggleColumnVisibility(hiddenColumns.value, key)
}

watch(hiddenColumns, () => {
  applyCurrentHistoryEntry()
}, { deep: true })

function toPackageInputs(dependencies) {
  if (!dependencies || typeof dependencies !== "object") {
    return []
  }
  return Object.entries(dependencies).map(([name, version]) => ({ name, version }))
}

/**
 * Validates raw package.json text and, on success, records it as a new
 * history entry and applies it. Returns true on success; on failure, sets
 * loadError and leaves the previous content untouched.
 */
function loadPackageJsonText(text) {
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch (err) {
    loadError.value = `That's not valid JSON: ${err.message}`
    return false
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    loadError.value = "Invalid package.json: expected a JSON object."
    return false
  }
  loadError.value = null

  const pushed = pushHistoryEntry(history.value, historyIndex.value, createHistoryEntry(text, parsed))
  history.value = pushed.history
  historyIndex.value = pushed.index
  applyCurrentHistoryEntry()
  return true
}

function goBack() {
  if (!canGoBack.value) return
  historyIndex.value -= 1
  applyCurrentHistoryEntry()
}

function goForward() {
  if (!canGoForward.value) return
  historyIndex.value += 1
  applyCurrentHistoryEntry()
}

function applyCurrentHistoryEntry() {
  const entry = history.value[historyIndex.value]
  if (!entry) return

  packageJsonContent.value = entry.content
  pkg.value = entry.pkg

  if (isEntryCacheValid(entry, hiddenColumns.value)) {
    deps.value = entry.deps
    devDeps.value = entry.devDeps
    isLoadingDeps.value = false
    isLoadingDevDeps.value = false
    return
  }

  fetchEntryDependencies(entry, historyIndex.value)
}

/**
 * Fetches (or re-fetches, if hiddenColumns has changed) an entry's
 * deps/devDeps, caches the result on the entry itself, and - only if the
 * user hasn't navigated elsewhere in the meantime - applies it to the
 * visible state.
 */
async function fetchEntryDependencies(entry, index) {
  const rawDeps = toPackageInputs(entry.pkg?.dependencies)
  const rawDevDeps = toPackageInputs(entry.pkg?.devDependencies)
  const hiddenColumnsAtFetchTime = new Set(hiddenColumns.value)

  if (historyIndex.value === index) {
    isLoadingDeps.value = rawDeps.length > 0
    isLoadingDevDeps.value = rawDevDeps.length > 0
  }

  const [depsResult, devDepsResult] = await Promise.all([
    rawDeps.length > 0
      ? fetchPackagesInfo(rawDeps, { hiddenColumns: hiddenColumnsAtFetchTime })
      : Promise.resolve([]),
    rawDevDeps.length > 0
      ? fetchPackagesInfo(rawDevDeps, { hiddenColumns: hiddenColumnsAtFetchTime })
      : Promise.resolve([]),
  ])

  entry.deps = depsResult
  entry.devDeps = devDepsResult
  entry.hiddenColumnsSnapshot = hiddenColumnsAtFetchTime

  if (historyIndex.value === index) {
    deps.value = depsResult
    devDeps.value = devDepsResult
    isLoadingDeps.value = false
    isLoadingDevDeps.value = false
  }
}

async function loadFromClipboard() {
  loadError.value = null
  try {
    const text = await navigator.clipboard.readText()
    loadPackageJsonText(text)
  } catch (err) {
    loadError.value = "Could not read the clipboard. Check the browser's clipboard permission and try again."
  }
}

function onFileSelected(event) {
  const file = event.target.files?.[0]
  if (!file) {
    return
  }
  const reader = new FileReader()
  reader.onload = () => loadPackageJsonText(String(reader.result))
  reader.onerror = () => {
    loadError.value = "Failed to read the selected file."
  }
  reader.readAsText(file)
}

/**
 * Fetches the single URL input's content, routing between a repo host
 * (GitHub/GitLab/Codeberg - resolved via fetchPackageJsonFromRepo, which
 * locates package.json on the repo's default branch) and any other URL
 * (fetched directly as the package.json content).
 */
async function fetchFromUrlInput() {
  isLoadingInput.value = true
  loadError.value = null
  try {
    const url = urlInput.value
    const content = isRepoHostUrl(url)
      ? await fetchPackageJsonFromRepo(url)
      : await fetchUrlAsText(url)
    if (!content) {
      throw new Error("Could not find a package.json at that URL.")
    }
    loadPackageJsonText(content)
  } catch (err) {
    loadError.value = err.message
  } finally {
    isLoadingInput.value = false
  }
}

async function fetchUrlAsText(url) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`)
  }
  return response.text()
}

async function onLoadPackage({ name, version }) {
  isLoadingInput.value = true
  loadError.value = null
  try {
    const content = await fetchPackageJsonForVersion(name, version)
    if (!content) {
      throw new Error(`Could not find package.json data for "${name}".`)
    }
    loadPackageJsonText(content)
  } catch (err) {
    loadError.value = err.message
  } finally {
    isLoadingInput.value = false
  }
}

// Bootstrap with this app's own package.json as the first history entry.
loadPackageJsonText(JSON.stringify(packageJson, null, 2))
</script>

<style>
#app {
  padding: 32px;
  text-align: left;
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
  flex-direction: column;
  gap: 8px;
  margin-bottom: 24px;
}

.url-fetch-row {
  display: flex;
  gap: 8px;
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

.accordion {
  margin-bottom: 16px;
}

.accordion > summary {
  cursor: pointer;
  font-weight: 600;
  padding: 4px 0;
}
</style>
