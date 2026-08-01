<template>
  <div>
    <h1>Package.json info</h1>
    <form id="repo-url-form" @submit.prevent="fetchRepoPackageJson">
      <label for="repo-url">Enter repo url</label>
      <input v-model="input" type="text" id="repo-url" />
      <button type="button" @click="fetchRepoPackageJson">
        FETCH
      </button>
    </form>
    <div>
      <h3>Deps</h3>
      <dependencies-table
        :dependencies="deps"
      />
      <h3>Dev Deps</h3>
      <dependencies-table
        :dependencies="devDeps"
      />
    </div>
    <div>
      <pre>{{pkg}}</pre>
    </div>
  </div>
</template>
<script lang="ts" setup>
import { ref, computed, watch } from "vue";
import { fetchPackagesInfo } from "./utils/npmPackage.ts"
import DependenciesTable from "./components/DependenciesTable.vue"
import packageJson from '../package.json'

const input = ref("");
const packageJsonContent = ref(JSON.stringify(packageJson))

const pkg = computed(() => JSON.parse(packageJsonContent.value))

const deps = ref([])
const devDeps = ref([])

watch(pkg, async () => {
  const { dependencies } = pkg.value
  const rawDeps = Object.keys(dependencies).map((key) => {
    const name = key
    const version = dependencies[key]
    return { name, version }
  })
  deps.value = await fetchPackagesInfo(rawDeps)
}, { immediate: true, deep: true })

watch(pkg, async () => {
  const { devDependencies } = pkg.value
  const rawDeps = Object.keys(devDependencies).map((key) => {
    const name = key
    const version = devDependencies[key]
    return { name, version }
  })
  devDeps.value = await fetchPackagesInfo(rawDeps)
}, { immediate: true, deep: true })

async function fetchRepoPackageJson() {
  const repoUrl = input.value
  const handlersByPattern = [
    ["github.com", fetchPackageJsonFromGithubRepo]
  ]
  for (const [pattern, callback] of handlersByPattern) {
    if (repoUrl.includes(pattern)) {
      const content = await callback(repoUrl)
      packageJsonContent.value = content
      break
    }
  }
}

async function fetchPackageJsonFromGithubRepo(githubUrl) {
  // 1. Validate GitHub URL and extract repo path
  const githubPattern =
    /^https:\/\/github\.com\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)(?:\/.*)?$/;
  const match = githubUrl.match(githubPattern);

  if (!match) {
    throw new Error(
      "Invalid GitHub URL. Must be in format: https://github.com/username/repo-name",
    );
  }

  const [_, username, repoName] = match;
  const repoPath = `${username}/${repoName}`;

  // 2. Check if package.json exists at the root of the repo
  let packageJsonUrl = ''

  const branches = ["main", "master"]
  for (const branch of branches) {
    packageJsonUrl = `https://raw.githubusercontent.com/${repoPath}/${branch}/package.json`;
    const response = await fetch(packageJsonUrl);
    if (! response.ok) {
      continue
    }
    return response.text()
  }
}
</script>

<style>
#app {
  padding: 32px;
  text-align: left;
}

input {
  display: block;
  width: 400px;
}
</style>
