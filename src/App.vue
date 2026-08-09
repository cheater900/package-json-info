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

    <div>
      <h3>Deps<span v-if="isLoadingDeps"> (loading…)</span></h3>
      <dependencies-table :dependencies="deps" />
      <h3>Dev Deps<span v-if="isLoadingDevDeps"> (loading…)</span></h3>
      <dependencies-table :dependencies="devDeps" />
    </div>
    <div>
      <pre>{{ packageJsonContent }}</pre>
    </div>
  </div>
</template>
<script lang="ts" setup>
import { ref, watch } from "vue";
import { fetchPackagesInfo } from "./utils/npmPackage.ts"
import { fetchPackageJsonFromRepo } from "./utils/repoPackageJson.ts"
import DependenciesTable from "./components/DependenciesTable.vue"
import packageJson from '../package.json'

const packageJsonContent = ref(JSON.stringify(packageJson, null, 2))
const pkg = ref(packageJson)

const loadError = ref(null)
const isLoadingInput = ref(false)
const isLoadingDeps = ref(false)
const isLoadingDevDeps = ref(false)

const pasteText = ref("")
const fileUrlInput = ref("")
const repoUrlInput = ref("")

const deps = ref([])
const devDeps = ref([])

watch(pkg, async () => {
  const rawDeps = toPackageInputs(pkg.value?.dependencies)
  if (rawDeps.length === 0) {
    deps.value = []
    return
  }
  isLoadingDeps.value = true
  try {
    deps.value = await fetchPackagesInfo(rawDeps)
  } finally {
    isLoadingDeps.value = false
  }
}, { immediate: true, deep: true })

watch(pkg, async () => {
  const rawDeps = toPackageInputs(pkg.value?.devDependencies)
  if (rawDeps.length === 0) {
    devDeps.value = []
    return
  }
  isLoadingDevDeps.value = true
  try {
    devDeps.value = await fetchPackagesInfo(rawDeps)
  } finally {
    isLoadingDevDeps.value = false
  }
}, { immediate: true, deep: true })

function toPackageInputs(dependencies) {
  if (!dependencies || typeof dependencies !== "object") {
    return []
  }
  return Object.entries(dependencies).map(([name, version]) => ({ name, version }))
}

/**
 * Validates and applies raw package.json text as the new input.
 * Returns true on success; on failure, sets loadError and leaves the
 * previous content untouched.
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
  packageJsonContent.value = text
  pkg.value = parsed
  return true
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
</script>

<style>
#app {
  padding: 32px;
  text-align: left;
}

input,
textarea {
  display: block;
  width: 400px;
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
  flex-wrap: wrap;
  gap: 24px;
  margin-bottom: 24px;
}

.input-method {
  flex: 1 1 260px;
}

.input-method-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}
</style>
