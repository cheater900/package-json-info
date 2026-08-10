<template>
  <table class="deps">
    <thead>
      <tr>
        <th><button type="button" @click="toggleSort('name')">Name{{ sortIndicator('name') }}</button></th>
        <th>Version</th>
        <th><button type="button" @click="toggleSort('versionDate')">Version Date{{ sortIndicator('versionDate') }}</button></th>
        <th>Latest version</th>
        <th><button type="button" @click="toggleSort('latestReleaseDate')">Latest release date{{ sortIndicator('latestReleaseDate') }}</button></th>
        <th><button type="button" @click="toggleSort('latestUpdateDate')">Latest update date{{ sortIndicator('latestUpdateDate') }}</button></th>
        <th><button type="button" @click="toggleSort('weeklyDownloads')">Weekly downloads{{ sortIndicator('weeklyDownloads') }}</button></th>
        <th>Source code</th>
        <th><button type="button" @click="toggleSort('gitStars')">Git stars{{ sortIndicator('gitStars') }}</button></th>
        <th><button type="button" @click="toggleSort('openPRs')">Open PRs{{ sortIndicator('openPRs') }}</button></th>
        <th><button type="button" @click="toggleSort('closedPRs')">Closed PRs{{ sortIndicator('closedPRs') }}</button></th>
        <th><button type="button" @click="toggleSort('openIssues')">Open issues{{ sortIndicator('openIssues') }}</button></th>
        <th><button type="button" @click="toggleSort('closedIssues')">Closed issues{{ sortIndicator('closedIssues') }}</button></th>
        <th>Dependencies</th>
      </tr>
    </thead>
    <tbody>
      <tr
        v-for="(dependency) in sortedDependencies"
        :key="dependency.name"
      >
        <td>{{ dependency.name }}</td>
        <td>{{ dependency.version }}</td>
        <td>{{ fmtDate(dependency.versionDate) }}</td>
        <td>{{ dependency.latestVersion ?? '-' }}</td>
        <td>{{ fmtDate(dependency.latestReleaseDate) }}</td>
        <td>{{ fmtDate(dependency.latestUpdateDate) }}</td>
        <td>{{ dependency.weeklyDownloads ?? '-' }}</td>
        <td>
          <a v-if="dependency.sourceCode" :href="dependency.sourceCode">link</a>
          <template v-else>-</template>
        </td>
        <td>{{ dependency.gitStars ?? '-' }}</td>
        <td>{{ dependency.openPRs ?? '-' }}</td>
        <td>{{ dependency.closedPRs ?? '-' }}</td>
        <td>{{ dependency.openIssues ?? '-' }}</td>
        <td>{{ dependency.closedIssues ?? '-' }}</td>
        <td>{{ fmtDependencies(dependency.dependencies) }}</td>
      </tr>
    </tbody>
  </table>
</template>

<script lang="ts" setup>
import { ref, computed } from "vue"

const { dependencies } = defineProps({
  dependencies: {
    type: Array,
    required: true
  }
})

// Columns whose values are meaningful to sort by (excludes the source-code
// link, the raw semver ranges, and the dependency list).
const SORT_ACCESSORS = {
  name: (d) => d.name,
  versionDate: (d) => d.versionDate,
  latestReleaseDate: (d) => d.latestReleaseDate,
  latestUpdateDate: (d) => d.latestUpdateDate,
  weeklyDownloads: (d) => d.weeklyDownloads,
  gitStars: (d) => d.gitStars,
  openPRs: (d) => d.openPRs,
  closedPRs: (d) => d.closedPRs,
  openIssues: (d) => d.openIssues,
  closedIssues: (d) => d.closedIssues,
}

const sortKey = ref(null)
const sortDir = ref('asc')

function toggleSort(key) {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortKey.value = key
    sortDir.value = 'asc'
  }
}

function sortIndicator(key) {
  if (sortKey.value !== key) return ''
  return sortDir.value === 'asc' ? ' ▲' : ' ▼'
}

/** Missing values always sort last, regardless of direction. */
function compareValues(a, b, dir) {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  const cmp = typeof a === 'string' ? a.localeCompare(b) : (a < b ? -1 : a > b ? 1 : 0)
  return dir === 'desc' ? -cmp : cmp
}

const sortedDependencies = computed(() => {
  if (! sortKey.value) return dependencies
  const accessor = SORT_ACCESSORS[sortKey.value]
  return [...dependencies].sort((a, b) => compareValues(accessor(a), accessor(b), sortDir.value))
})

function fmtDate(dateStr) {
  if (! dateStr) return '-'
  try {
    return (new Date(dateStr)).toDateString()
  } catch {
    return dateStr
  }
}

function fmtDependencies(dependencyNames) {
  if (! dependencyNames || dependencyNames.length === 0) return '-'
  return dependencyNames.join(', ')
}
</script>

<style>
table.deps {
  display: block;
  overflow-x: scroll;
  width: 100%;
}

table th, table td {
  padding: 8px 12px;
}
</style>
