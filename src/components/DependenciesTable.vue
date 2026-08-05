<template>
  <table class="deps">
    <thead>
      <th>Name</th>
      <th>Version</th>
      <th>Version Date</th>
      <th>Latest version</th>
      <th>Latest release date</th>
      <th>Latest update date</th>
      <th>Weekly downloads</th>
      <th>Source code</th>
      <th>Git stars</th>
      <th>Open PRs</th>
      <th>Closed PRs</th>
      <th>Open issues</th>
      <th>Closed issues</th>
      <th>Dependencies</th>
    </thead>
    <tbody>
      <tr
        v-for="(dependency) in dependencies"
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
import { defineProps } from "vue"

const { dependencies } = defineProps({
  dependencies: {
    type: Array,
    required: true
  }
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
