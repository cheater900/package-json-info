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
      <div class="input-method">
        <h3>Paste JSON</h3>
        <label for="paste-input">Paste package.json content</label>
        <textarea
          id="paste-input"
          v-model="pasteText"
          rows="6"
          placeholder="{ &quot;name&quot;: &quot;my-app&quot;, ... }"
        ></textarea>
        <div class="input-method-actions">
          <button type="button" @click="loadFromPaste" :disabled="isLoadingInput">
            Load pasted JSON
          </button>
          <button type="button" @click="loadFromClipboard" :disabled="isLoadingInput">
            Read from clipboard
          </button>
        </div>
      </div>

      <div class="input-method">
        <h3>Upload file</h3>
        <label for="file-input">Upload a package.json file</label>
        <input
          id="file-input"
          type="file"
          accept=".json,application/json"
          @change="onFileSelected"
        />
      </div>

      <div class="input-method">
        <h3>File URL</h3>
        <form @submit.prevent="fetchFromFileUrl">
          <label for="file-url">Enter a URL to a package.json file</label>
          <input v-model="fileUrlInput" type="text" id="file-url" />
          <button type="submit" :disabled="isLoadingInput">FETCH</button>
        </form>
      </div>

      <div class="input-method">
        <h3>Git URL</h3>
        <form @submit.prevent="fetchRepoPackageJson">
          <label for="repo-url">Enter repo url (GitHub, GitLab, or Codeberg)</label>
          <input v-model="repoUrlInput" type="text" id="repo-url" />
          <button type="submit" :disabled="isLoadingInput">FETCH</button>
        </form>
      </div>
    </section>

    <section class="history-controls">
      <button type="button" @click="goBack" :disabled="!canGoBack">← Back</button>
      <span>{{ historyIndex + 1 }} / {{ history.length }}</span>
      <button type="button" @click="goForward" :disabled="!canGoForward">Forward →</button>
    </section>

    <column-visibility-panel
      :hidden-columns="hiddenColumns"
      @toggle-column="onToggleColumn"
    />

    <div>
      <h3>Deps<span v-if="isLoadingDeps"> (loading…)</span></h3>
      <dependencies-table
        :dependencies="deps"
        :hidden-columns="hiddenColumns"
        @load-package="onLoadPackage"
      />
      <h3>Dev Deps<span v-if="isLoadingDevDeps"> (loading…)</span></h3>
      <dependencies-table
        :dependencies="devDeps"
        :hidden-columns="hiddenColumns"
        @load-package="onLoadPackage"
      />
    </div>
    <div>
      <pre>{{ packageJsonContent }}</pre>
    </div>
  </div>
</template>
<script lang="ts" setup>
import { ref, computed, watch } from "vue";
import { fetchPackagesInfo, fetchPackageJsonForVersion } from "./utils/npmPackage.ts"
import { fetchPackageJsonFromRepo } from "./utils/repoPackageJson.ts"
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

const pasteText = ref("")
const fileUrlInput = ref("")
const repoUrlInput = ref("")

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

function loadFromPaste() {
  loadPackageJsonText(pasteText.value)
}

async function loadFromClipboard() {
  try {
    const text = await navigator.clipboard.readText()
    pasteText.value = text
    loadPackageJsonText(text)
  } catch (err) {
    loadError.value = "Could not read the clipboard. Paste into the text box instead."
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

async function fetchFromFileUrl() {
  isLoadingInput.value = true
  loadError.value = null
  try {
    const response = await fetch(fileUrlInput.value)
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`)
    }
    const text = await response.text()
    loadPackageJsonText(text)
  } catch (err) {
    loadError.value = `Could not fetch package.json from that URL: ${err.message}`
  } finally {
    isLoadingInput.value = false
  }
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

async function fetchRepoPackageJson() {
  isLoadingInput.value = true
  loadError.value = null
  try {
    const content = await fetchPackageJsonFromRepo(repoUrlInput.value)
    if (!content) {
      throw new Error("Could not find a package.json in that repository.")
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
  margin-bottom: 24px;
}

.input-method {
  flex: 1 1 260px;
}

.input-method-actions {
  margin-top: 8px;
}

.history-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}
</style>
