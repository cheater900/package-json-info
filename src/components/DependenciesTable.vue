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
        <th><button type="button" @click="toggleSort('isOutdated')">Outdated{{ sortIndicator('isOutdated') }}</button></th>
        <th><button type="button" @click="toggleSort('weeklyDownloads')">Weekly downloads{{ sortIndicator('weeklyDownloads') }}</button></th>
        <th>Source code</th>
        <th><button type="button" @click="toggleSort('gitStars')">Git stars{{ sortIndicator('gitStars') }}</button></th>
        <th><button type="button" @click="toggleSort('openPRs')">Open PRs{{ sortIndicator('openPRs') }}</button></th>
        <th><button type="button" @click="toggleSort('closedPRs')">Closed PRs{{ sortIndicator('closedPRs') }}</button></th>
        <th><button type="button" @click="toggleSort('openIssues')">Open issues{{ sortIndicator('openIssues') }}</button></th>
        <th><button type="button" @click="toggleSort('closedIssues')">Closed issues{{ sortIndicator('closedIssues') }}</button></th>
        <th>Dependencies</th>
        <th>License</th>
        <th>Deprecated</th>
        <th><button type="button" @click="toggleSort('vulnerabilityCount')">Vulnerabilities{{ sortIndicator('vulnerabilityCount') }}</button></th>
        <th><button type="button" @click="toggleSort('bundleSizeGzip')">Bundle size (gzip){{ sortIndicator('bundleSizeGzip') }}</button></th>
        <th>Maintainers</th>
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
        <td>{{ fmtOutdated(dependency.isOutdated) }}</td>
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
        <td>{{ fmtList(dependency.dependencies) }}</td>
        <td>{{ fmtLicense(dependency.license) }}</td>
        <td>{{ dependency.deprecated ?? '-' }}</td>
        <td>{{ dependency.vulnerabilityCount ?? '-' }}</td>
        <td>{{ fmtBundleSize(dependency.bundleSizeGzip) }}</td>
        <td>{{ fmtList(dependency.maintainers) }}</td>
      </tr>
    </tbody>
  </table>
</template>

<script lang="ts" setup>
import { ref, computed } from "vue"
import { hasLicenseWarning } from "../utils/license"

const { dependencies } = defineProps({
  dependencies: {
    type: Array,
    required: true
  }
})

// Columns whose values are meaningful to sort by (excludes the source-code
// link, the raw semver ranges, and list-valued columns).
const SORT_ACCESSORS = {
  name: (d) => d.name,
  versionDate: (d) => d.versionDate,
  latestReleaseDate: (d) => d.latestReleaseDate,
  latestUpdateDate: (d) => d.latestUpdateDate,
  isOutdated: (d) => d.isOutdated,
  weeklyDownloads: (d) => d.weeklyDownloads,
  gitStars: (d) => d.gitStars,
  openPRs: (d) => d.openPRs,
  closedPRs: (d) => d.closedPRs,
  openIssues: (d) => d.openIssues,
  closedIssues: (d) => d.closedIssues,
  vulnerabilityCount: (d) => d.vulnerabilityCount,
  bundleSizeGzip: (d) => d.bundleSizeGzip,
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

function fmtList(names) {
  if (! names || names.length === 0) return '-'
  return names.join(', ')
}

function fmtOutdated(isOutdated) {
  if (isOutdated === null || isOutdated === undefined) return '-'
  return isOutdated ? 'Yes' : 'No'
}

function fmtLicense(license) {
  const label = license ?? '-'
  return hasLicenseWarning(license) ? `${label} ⚠` : label
}

function fmtBundleSize(gzipBytes) {
  if (gzipBytes === null || gzipBytes === undefined) return '-'
  return `${(gzipBytes / 1024).toFixed(1)} KB`
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
