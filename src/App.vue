<template>
    <div>
        <div class="terminal-titlebar">
            <span class="terminal-titlebar__dot"></span>
            <span class="terminal-titlebar__dot"></span>
            <span class="terminal-titlebar__dot"></span>
            <span class="terminal-titlebar__path">{{ t("app.titlebarPath") }}</span>
            <settings-menu @open-network-log="openNetworkLog" />
        </div>

        <h1 class="title">
            <span>{{ t("app.title") }}</span>
            <span class="title__cursor">_</span>
        </h1>

        <div v-if="loadError" class="banner banner--error" role="alert">
            <icon-warning class="inline-icon" />
            {{ loadError }}
        </div>
        <div v-if="isLoadingInput" class="banner banner--loading">
            {{ t("input.loading") }}
        </div>

        <p class="intro">{{ t("input.description") }}</p>

        <section class="input-methods">
            <form class="input-methods__url-form" @submit.prevent="loadFromUrlInput">
                <label for="url-input" class="visually-hidden">
                    {{ t("input.urlLabel") }}
                </label>
                <input
                    id="url-input"
                    v-model="urlInput"
                    type="text"
                    :placeholder="t('input.urlPlaceholder')"
                />
                <button type="submit" :disabled="isLoadingInput">
                    <icon-arrow-down class="btn-icon" />
                    {{ t("input.fetch") }}
                </button>
            </form>

            <div class="input-methods__actions">
                <input
                    ref="fileInputRef"
                    class="input-methods__file-input"
                    type="file"
                    accept=".json,application/json"
                    @change="loadFromFile"
                />
                <button type="button" @click="fileInputRef?.click()" :disabled="isLoadingInput">
                    <icon-upload class="btn-icon" />
                    {{ t("input.uploadFile") }}
                </button>
                <button type="button" @click="loadFromClipboard" :disabled="isLoadingInput">
                    <icon-clipboard class="btn-icon" />
                    {{ t("input.pasteFromClipboard") }}
                </button>
            </div>
        </section>

        <details class="accordion" open>
            <summary>
                <icon-columns class="inline-icon" />
                {{ t("sections.columns") }}
            </summary>
            <column-visibility-panel
                :visible-columns="visibleColumns"
                :column-order="columnOrder"
                @toggle-column="toggleColumn"
            />
            <label class="shrink-toggle">
                <input type="checkbox" v-model="shrinkColumnLabels" />
                {{ t("sections.shrinkColumnLabels") }}
            </label>
        </details>

        <section v-if="history.length > 1" class="history-controls">
            <button type="button" @click="goBack" :disabled="!canGoBack">
                <icon-arrow-left class="btn-icon" />
                {{ t("history.back") }}
            </button>
            <span>
                {{ t("history.position", { current: historyIndex + 1, total: history.length }) }}
            </span>
            <button type="button" @click="goForward" :disabled="!canGoForward">
                {{ t("history.forward") }}
                <icon-arrow-right class="btn-icon" />
            </button>
        </section>

        <!-- prettier-ignore -->
        <div v-if="pkg?.name" class="package-name">
            {{ t("sections.showingDependenciesFor") }} <pre class="inline-pre">{{ pkg.name }}</pre>:
        </div>

        <div v-if="workspace?.paths.length" class="workspace-picker">
            <label :for="workspaceSelectId">
                <icon-layers class="inline-icon" />
                {{ t("workspaces.label") }}
            </label>
            <select
                :id="workspaceSelectId"
                :value="workspace.current"
                :disabled="isLoadingInput"
                @change="selectWorkspace"
            >
                <option :value="WORKSPACE_ROOT">{{ t("workspaces.root") }}</option>
                <option v-for="path in workspace.paths" :key="path" :value="path">
                    {{ path }}
                </option>
            </select>
        </div>
        <p v-if="workspace?.truncated" class="workspace-picker__note">
            {{ t("workspaces.truncated") }}
        </p>
        <p v-if="workspace?.failed" class="workspace-picker__note">
            {{ t("workspaces.failed") }}
        </p>
        <p v-if="hasUnlistedWorkspaces" class="workspace-picker__note">
            {{ t("workspaces.hint") }}
        </p>

        <div class="search-row">
            <label :for="searchInputId" class="visually-hidden">
                {{ t("search.label") }}
            </label>
            <span class="search-row__field">
                <icon-magnifier class="search-row__icon" />
                <input
                    :id="searchInputId"
                    v-model="searchQuery"
                    type="text"
                    :placeholder="t('search.placeholder')"
                />
            </span>
        </div>

        <details
            v-for="section in tableSections"
            :key="section.id"
            class="accordion accordion--boxed"
            open
        >
            <summary>
                <component :is="section.icon" class="inline-icon" />
                {{ section.title }}
                <span v-if="section.isLoading">{{ t("sections.loading") }}</span>
            </summary>
            <dependencies-table
                v-bind="tableProps"
                :dependencies="section.dependencies"
                :is-loading="section.isLoading"
                v-on="tableListeners"
            />
            <div class="table-actions">
                <button
                    v-if="section.hasRetryableRows && !section.isLoading"
                    type="button"
                    class="table-actions__retry"
                    :disabled="isRetrying"
                    @click="retryFailedRows(section.dependencies)"
                >
                    <icon-reload class="btn-icon" />
                    {{ t("sections.retryFailed") }}
                </button>
                <button
                    type="button"
                    class="table-actions__expand"
                    @click="expandTable(section.id)"
                >
                    <icon-expand class="btn-icon" />
                    {{ t("sections.expandTable") }}
                </button>
                <button
                    type="button"
                    class="table-actions__export"
                    :disabled="isLoadingTables"
                    @click="openExport(section.id)"
                >
                    <icon-download class="btn-icon" />
                    {{ t("export.open") }}
                </button>
            </div>
        </details>
        <details class="accordion accordion--boxed" open>
            <summary>
                <icon-file-json class="inline-icon" />
                {{ pkg?.name ? t("sections.packageJsonOf") : t("sections.packageJson") }}
                <pre v-if="pkg?.name" class="inline-pre">{{ pkg.name }}</pre>
            </summary>
            <vue-json-pretty :data="pkg" show-icon show-line-number show-length />
        </details>

        <modal v-if="modalContent" :title="modalTitle" @close="closeModal">
            <div v-if="expandedSection" class="table-modal-content">
                <dependencies-table
                    v-bind="tableProps"
                    :dependencies="expandedSection.dependencies"
                    :is-loading="expandedSection.isLoading"
                    v-on="tableListeners"
                />
            </div>
            <package-summary-card
                v-else-if="modalContent.kind === 'summary'"
                :dependency="modalContent.dependency"
                @open-source-tree="openSourceTree"
            />
            <source-tree-browser
                v-else-if="modalContent.kind === 'sourceTree'"
                :dependency-name="modalContent.dependency.name"
                :source-tree="modalContent.dependency.sourceTree"
            />
            <export-dialog
                v-else-if="modalContent.kind === 'export'"
                :tables="tableSections"
                :initial-table-ids="[modalContent.sectionId]"
                :column-order="columnOrder"
                :initial-columns="visibleColumnKeys"
                :fetched-columns="fetchedColumns"
                :title="exportTitle"
                :load-rows="fetchRowsWithColumns"
                @close="closeModal"
            />
            <network-log-dialog
                v-else-if="modalContent.kind === 'networkLog'"
                @retry="retryNetworkRequest"
            />
        </modal>
    </div>
</template>
<script lang="ts" src="./App.ts"></script>

<style src="./App.css"></style>
