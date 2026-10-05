<template>
    <span class="sort-indicator" aria-hidden="true">
        <span
            class="sort-indicator__arrow"
            :class="{ 'sort-indicator__arrow--active': direction === 'asc' }"
        >
            ▲
        </span>
        <span
            class="sort-indicator__arrow"
            :class="{ 'sort-indicator__arrow--active': direction === 'desc' }"
        >
            ▼
        </span>
    </span>
</template>

<script lang="ts" src="./SortIndicator.ts"></script>

<style src="./SortIndicator.css"></style>
