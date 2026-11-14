<template>
    <div class="network-log">
        <div class="network-log__scroll">
            <table class="network-log__table">
                <thead>
                    <tr>
                        <th v-for="header in headers" :key="header" scope="col">
                            {{ t(`networkLog.headers.${header}`) }}
                        </th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-if="entries.length === 0">
                        <td :colspan="headers.length" class="network-log__empty">
                            {{ t("networkLog.empty") }}
                        </td>
                    </tr>
                    <tr v-for="entry in entries" :key="entry.id">
                        <td>
                            <span
                                :class="[
                                    'network-log__state',
                                    `network-log__state--${entry.state}`,
                                ]"
                                role="img"
                                :aria-label="t(`networkLog.states.${entry.state}`)"
                                :title="t(`networkLog.states.${entry.state}`)"
                            >
                                <component :is="STATE_ICONS[entry.state]" />
                            </span>
                        </td>
                        <td>{{ formatTime(entry.startedAt) }}</td>
                        <td>
                            <text-wrapped>
                                <span class="network-log__badge">{{ entry.method }}</span>
                                {{ entry.url }}
                            </text-wrapped>
                        </td>
                        <td>
                            <text-wrapped>{{ entry.package ?? MISSING_VALUE }}</text-wrapped>
                        </td>
                        <td>
                            <text-wrapped>{{ formatDependencies(entry) }}</text-wrapped>
                        </td>
                        <td>
                            <text-wrapped>{{ formatColumns(entry) }}</text-wrapped>
                        </td>
                        <td :title="entry.error ?? undefined">
                            <span v-if="entry.status === null">{{ MISSING_VALUE }}</span>
                            <span v-else class="network-log__badge">{{ entry.status }}</span>
                        </td>
                        <td>{{ formatSize(entry) }}</td>
                        <td>
                            <button
                                v-if="entry.state === 'failure'"
                                type="button"
                                class="network-log__retry"
                                :aria-label="t('networkLog.retry', { url: entry.url })"
                                @click="$emit('retry', entry)"
                            >
                                <icon-reload />
                            </button>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
        <p class="network-log__summary">{{ summary }}</p>
    </div>
</template>

<script lang="ts" src="./NetworkLogDialog.ts"></script>

<style src="./NetworkLogDialog.css"></style>
