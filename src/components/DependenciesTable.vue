<template>
    <div class="table-controls">
        <label :for="searchInputId">Search by name</label>
        <input
            :id="searchInputId"
            type="text"
            v-model="searchQuery"
            placeholder="Filter by package name"
        />
    </div>
    <table class="deps">
        <thead>
            <tr>
                <th>
                    <button type="button" @click="toggleSort('name')">
                        Name{{ sortIndicator("name") }}
                    </button>
                </th>
                <th v-if="isVisible('version')">Version</th>
                <th v-if="isVisible('versionDate')">
                    <button type="button" @click="toggleSort('versionDate')">
                        Version Date{{ sortIndicator("versionDate") }}
                    </button>
                </th>
                <th v-if="isVisible('latestVersion')">Latest version</th>
                <th v-if="isVisible('latestReleaseDate')">
                    <button type="button" @click="toggleSort('latestReleaseDate')">
                        Latest release date{{ sortIndicator("latestReleaseDate") }}
                    </button>
                </th>
                <th v-if="isVisible('latestUpdateDate')">
                    <button type="button" @click="toggleSort('latestUpdateDate')">
                        Latest update date{{ sortIndicator("latestUpdateDate") }}
                    </button>
                </th>
                <th v-if="isVisible('isOutdated')">
                    <button type="button" @click="toggleSort('isOutdated')">
                        Outdated{{ sortIndicator("isOutdated") }}
                    </button>
                </th>
                <th v-if="isVisible('weeklyDownloads')">
                    <button type="button" @click="toggleSort('weeklyDownloads')">
                        Weekly downloads{{ sortIndicator("weeklyDownloads") }}
                    </button>
                </th>
                <th v-if="isVisible('sourceCode')">Source code</th>
                <th v-if="isVisible('gitStars')">
                    <button type="button" @click="toggleSort('gitStars')">
                        Git stars{{ sortIndicator("gitStars") }}
                    </button>
                </th>
                <th v-if="isVisible('openPRs')">
                    <button type="button" @click="toggleSort('openPRs')">
                        Open PRs{{ sortIndicator("openPRs") }}
                    </button>
                </th>
                <th v-if="isVisible('closedPRs')">
                    <button type="button" @click="toggleSort('closedPRs')">
                        Closed PRs{{ sortIndicator("closedPRs") }}
                    </button>
                </th>
                <th v-if="isVisible('openIssues')">
                    <button type="button" @click="toggleSort('openIssues')">
                        Open issues{{ sortIndicator("openIssues") }}
                    </button>
                </th>
                <th v-if="isVisible('closedIssues')">
                    <button type="button" @click="toggleSort('closedIssues')">
                        Closed issues{{ sortIndicator("closedIssues") }}
                    </button>
                </th>
                <th v-if="isVisible('dependencies')">Dependencies</th>
                <th v-if="isVisible('license')">License</th>
                <th v-if="isVisible('deprecated')">Deprecated</th>
                <th v-if="isVisible('vulnerabilityCount')">
                    <button type="button" @click="toggleSort('vulnerabilityCount')">
                        Vulnerabilities{{ sortIndicator("vulnerabilityCount") }}
                    </button>
                </th>
                <th v-if="isVisible('bundleSizeGzip')">
                    <button type="button" @click="toggleSort('bundleSizeGzip')">
                        Bundle size (gzip){{ sortIndicator("bundleSizeGzip") }}
                    </button>
                </th>
                <th v-if="isVisible('maintainers')">Maintainers</th>
                <th>Load</th>
            </tr>
        </thead>
        <tbody>
            <tr v-for="dependency in sortedDependencies" :key="dependency.name">
                <td>{{ dependency.name }}</td>
                <td v-if="isVisible('version')">{{ dependency.version }}</td>
                <td v-if="isVisible('versionDate')">{{ fmtDate(dependency.versionDate) }}</td>
                <td v-if="isVisible('latestVersion')">{{ dependency.latestVersion ?? "-" }}</td>
                <td v-if="isVisible('latestReleaseDate')">
                    {{ fmtDate(dependency.latestReleaseDate) }}
                </td>
                <td v-if="isVisible('latestUpdateDate')">
                    {{ fmtDate(dependency.latestUpdateDate) }}
                </td>
                <td v-if="isVisible('isOutdated')">{{ fmtOutdated(dependency.isOutdated) }}</td>
                <td v-if="isVisible('weeklyDownloads')">{{ dependency.weeklyDownloads ?? "-" }}</td>
                <td v-if="isVisible('sourceCode')">
                    <a v-if="dependency.sourceCode" :href="dependency.sourceCode">link</a>
                    <template v-else>-</template>
                </td>
                <td v-if="isVisible('gitStars')">{{ dependency.gitStars ?? "-" }}</td>
                <td v-if="isVisible('openPRs')">{{ dependency.openPRs ?? "-" }}</td>
                <td v-if="isVisible('closedPRs')">{{ dependency.closedPRs ?? "-" }}</td>
                <td v-if="isVisible('openIssues')">{{ dependency.openIssues ?? "-" }}</td>
                <td v-if="isVisible('closedIssues')">{{ dependency.closedIssues ?? "-" }}</td>
                <td v-if="isVisible('dependencies')">{{ fmtList(dependency.dependencies) }}</td>
                <td v-if="isVisible('license')">{{ fmtLicense(dependency.license) }}</td>
                <td v-if="isVisible('deprecated')">{{ dependency.deprecated ?? "-" }}</td>
                <td v-if="isVisible('vulnerabilityCount')">
                    {{ dependency.vulnerabilityCount ?? "-" }}
                </td>
                <td v-if="isVisible('bundleSizeGzip')">
                    {{ fmtBundleSize(dependency.bundleSizeGzip) }}
                </td>
                <td v-if="isVisible('maintainers')">{{ fmtList(dependency.maintainers) }}</td>
                <td>
                    <button
                        type="button"
                        @click="
                            $emit('load-package', {
                                name: dependency.name,
                                version: dependency.version,
                            })
                        "
                    >
                        Load
                    </button>
                </td>
            </tr>
        </tbody>
    </table>
</template>

<script lang="ts" setup>
import { ref, computed, useId } from "vue";
import { hasLicenseWarning } from "../utils/license";
import { isColumnVisible } from "../utils/tableColumns";

const props = defineProps({
    dependencies: {
        type: Array,
        required: true,
    },
    hiddenColumns: {
        type: Set,
        default: () => new Set(),
    },
});

defineEmits(["load-package"]);

const searchInputId = useId();
const searchQuery = ref("");

const filteredDependencies = computed(() => {
    const query = searchQuery.value.trim().toLowerCase();
    if (!query) return props.dependencies;
    return props.dependencies.filter((d) => d.name?.toLowerCase().includes(query));
});

function isVisible(key) {
    return isColumnVisible(props.hiddenColumns, key);
}

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
};

const sortKey = ref(null);
const sortDir = ref("asc");

function toggleSort(key) {
    if (sortKey.value === key) {
        sortDir.value = sortDir.value === "asc" ? "desc" : "asc";
    } else {
        sortKey.value = key;
        sortDir.value = "asc";
    }
}

function sortIndicator(key) {
    if (sortKey.value !== key) return "";
    return sortDir.value === "asc" ? " ▲" : " ▼";
}

/** Missing values always sort last, regardless of direction. */
function compareValues(a, b, dir) {
    if (a == null && b == null) return 0;
    if (a == null) return 1;
    if (b == null) return -1;
    const cmp = typeof a === "string" ? a.localeCompare(b) : a < b ? -1 : a > b ? 1 : 0;
    return dir === "desc" ? -cmp : cmp;
}

const sortedDependencies = computed(() => {
    if (!sortKey.value) return filteredDependencies.value;
    const accessor = SORT_ACCESSORS[sortKey.value];
    return [...filteredDependencies.value].sort((a, b) =>
        compareValues(accessor(a), accessor(b), sortDir.value),
    );
});

function fmtDate(dateStr) {
    if (!dateStr) return "-";
    try {
        return new Date(dateStr).toDateString();
    } catch {
        return dateStr;
    }
}

function fmtList(names) {
    if (!names || names.length === 0) return "-";
    return names.join(", ");
}

function fmtOutdated(isOutdated) {
    if (isOutdated === null || isOutdated === undefined) return "-";
    return isOutdated ? "Yes" : "No";
}

function fmtLicense(license) {
    const label = license ?? "-";
    return hasLicenseWarning(license) ? `${label} ⚠` : label;
}

function fmtBundleSize(gzipBytes) {
    if (gzipBytes === null || gzipBytes === undefined) return "-";
    return `${(gzipBytes / 1024).toFixed(1)} KB`;
}
</script>

<style>
.table-controls {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
}

table.deps {
    display: block;
    overflow-x: scroll;
    width: 100%;
}

table th,
table td {
    padding: 8px 12px;
}
</style>
