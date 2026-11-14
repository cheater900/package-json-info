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
            {{ loadError }}
        </div>
        <div v-if="isLoadingInput" class="banner banner--loading">
            {{ t("input.loading") }}
        </div>

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
                    <span class="btn-icon" aria-hidden="true">↓</span>
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
                    <span class="btn-icon" aria-hidden="true">⧉</span>
                    {{ t("input.pasteFromClipboard") }}
                </button>
            </div>
        </section>

        <details class="accordion">
            <summary>{{ t("sections.columns") }}</summary>
            <column-visibility-panel
                :visible-columns="visibleColumns"
                :column-order="columnOrder"
                @toggle-column="toggleColumn"
            />
        </details>

        <section v-if="history.length > 1" class="history-controls">
            <button type="button" @click="goBack" :disabled="!canGoBack">
                {{ t("history.back") }}
            </button>
            <span>
                {{ t("history.position", { current: historyIndex + 1, total: history.length }) }}
            </span>
            <button type="button" @click="goForward" :disabled="!canGoForward">
                {{ t("history.forward") }}
            </button>
        </section>

        <h2 v-if="pkg?.name" class="package-name">{{ pkg.name }}</h2>

        <div v-if="workspace?.paths.length" class="workspace-picker">
            <label :for="workspaceSelectId">{{ t("workspaces.label") }}</label>
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

        <div class="search-shrink-row">
            <div class="search-shrink-row__search">
                <label :for="searchInputId" class="visually-hidden">
                    {{ t("search.label") }}
                </label>
                <input
                    :id="searchInputId"
                    v-model="searchQuery"
                    type="text"
                    :placeholder="t('search.placeholder')"
                />
            </div>

            <div class="search-shrink-row__shrink">
                <label>
                    <input type="checkbox" v-model="shrinkColumnLabels" />
                    {{ t("sections.shrinkColumnLabels") }}
                </label>
            </div>
        </div>

        <details
            v-for="section in tableSections"
            :key="section.id"
            class="accordion accordion--table"
            open
        >
            <summary>
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
                    <span class="btn-icon" aria-hidden="true">⤢</span>
                    {{ t("sections.expandTable") }}
                </button>
            </div>
        </details>
        <button type="button" class="table-export" :disabled="isLoadingTables" @click="openExport">
            {{ t("export.open") }}
        </button>
        <details class="accordion" open>
            <summary>{{ t("sections.packageJson") }}</summary>
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
