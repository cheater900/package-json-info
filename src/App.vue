<template>
    <div>
        <div class="terminal-titlebar">
            <span class="dot"></span>
            <span class="dot"></span>
            <span class="dot"></span>
            <span class="path">node ~/package.json</span>
        </div>

        <h1>
            <span>$ package.json info</span>
            <span class="cursor">_</span>
        </h1>

        <div v-if="loadError" class="banner banner-error" role="alert">
            {{ loadError }}
        </div>
        <div v-if="isLoadingInput" class="banner banner-loading">Loading package.json…</div>

        <section class="input-methods">
            <form class="url-fetch-row" @submit.prevent="fetchFromUrlInput">
                <label for="url-input" class="visually-hidden">
                    Enter a package.json URL, or a GitHub/GitLab/Codeberg repo URL
                </label>
                <input id="url-input" v-model="urlInput" type="text" placeholder="Enter url..." />
                <button type="submit" :disabled="isLoadingInput">
                    <span class="btn-icon" aria-hidden="true">↓</span>
                    Fetch
                </button>
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
                    <svg class="btn-icon" aria-hidden="true" viewBox="0 0 16 16" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M8 10.5V2M8 2 4.5 5.5M8 2l3.5 3.5" />
                        <path d="M2.5 11v2a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-2" />
                    </svg>
                    Upload file
                </button>
                <button type="button" @click="loadFromClipboard" :disabled="isLoadingInput">
                    <span class="btn-icon" aria-hidden="true">⧉</span>
                    Paste from clipboard
                </button>
            </div>
        </section>

        <details class="accordion">
            <summary>Columns</summary>
            <column-visibility-panel
                :visible-columns="visibleColumns"
                :column-order="columnOrder"
                @toggle-column="toggleColumn"
            />
        </details>

        <section v-if="history.length > 1" class="history-controls">
            <button type="button" @click="goBack" :disabled="!canGoBack">← Back</button>
            <span>{{ historyIndex + 1 }} / {{ history.length }}</span>
            <button type="button" @click="goForward" :disabled="!canGoForward">Forward →</button>
        </section>

        <div class="search-shrink-row">
            <div class="search-controls">
                <label :for="searchInputId" class="visually-hidden">Search by name</label>
                <input
                    :id="searchInputId"
                    v-model="searchQuery"
                    type="text"
                    placeholder="Filter by package name"
                />
            </div>

            <div class="shrink-labels-controls">
                <label>
                    <input type="checkbox" v-model="shrinkColumnLabels" />
                    Shrink columns by abbreviation
                </label>
            </div>
        </div>

        <h2 v-if="pkg?.name" class="package-name">{{ pkg.name }}</h2>

        <details class="accordion" open>
            <summary>
                Deps
                <span v-if="isLoadingDeps">(loading…)</span>
            </summary>
            <div class="table-toolbar">
                <button
                    type="button"
                    class="table-expand-toggle"
                    aria-label="Expand table"
                    @click="expandDeps"
                >
                    ⤢
                </button>
            </div>
            <dependencies-table
                :dependencies="deps"
                :columns="visibleColumnKeys"
                :search-query="searchQuery"
                :shrink-labels="shrinkColumnLabels"
                :is-loading="isLoadingDeps"
                @load-package="onLoadPackage"
                @reorder-columns="reorderColumns"
                @open-source-tree="openSourceTree"
            />
        </details>

        <details class="accordion" open>
            <summary>
                Dev Deps
                <span v-if="isLoadingDevDeps">(loading…)</span>
            </summary>
            <div class="table-toolbar">
                <button
                    type="button"
                    class="table-expand-toggle"
                    aria-label="Expand table"
                    @click="expandDevDeps"
                >
                    ⤢
                </button>
            </div>
            <dependencies-table
                :dependencies="devDeps"
                :columns="visibleColumnKeys"
                :search-query="searchQuery"
                :shrink-labels="shrinkColumnLabels"
                :is-loading="isLoadingDevDeps"
                @load-package="onLoadPackage"
                @reorder-columns="reorderColumns"
                @open-source-tree="openSourceTree"
            />
        </details>
        <details class="accordion" open>
            <summary>package.json</summary>
            <vue-json-pretty :data="pkg" show-icon show-line-number show-length />
        </details>

        <modal
            v-if="isDepsExpanded || isDevDepsExpanded || activeSourceTreeDependency"
            @close="closeModal"
        >
            <div v-if="isDepsExpanded || isDevDepsExpanded" class="table-modal-content">
                <dependencies-table
                    v-if="isDepsExpanded"
                    :dependencies="deps"
                    :columns="visibleColumnKeys"
                    :search-query="searchQuery"
                    :shrink-labels="shrinkColumnLabels"
                    :is-loading="isLoadingDeps"
                    @load-package="onLoadPackage"
                    @reorder-columns="reorderColumns"
                    @open-source-tree="openSourceTree"
                />
                <dependencies-table
                    v-else
                    :dependencies="devDeps"
                    :columns="visibleColumnKeys"
                    :search-query="searchQuery"
                    :shrink-labels="shrinkColumnLabels"
                    :is-loading="isLoadingDevDeps"
                    @load-package="onLoadPackage"
                    @reorder-columns="reorderColumns"
                    @open-source-tree="openSourceTree"
                />
            </div>
            <source-tree-browser
                v-else
                :dependency-name="activeSourceTreeDependency.name"
                :source-tree="activeSourceTreeDependency.sourceTree"
            />
        </modal>
    </div>
</template>
<script lang="ts" src="./App.ts"></script>

<style src="./App.css"></style>
