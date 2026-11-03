<template>
    <span class="sort-indicator" aria-hidden="true">
        <icon-caret-up
            class="sort-indicator__arrow"
            :class="{ 'sort-indicator__arrow--active': direction === 'asc' }"
        />
        <icon-caret-up
            class="sort-indicator__arrow sort-indicator__arrow--down"
            :class="{ 'sort-indicator__arrow--active': direction === 'desc' }"
        />
    </span>
</template>

<script lang="ts" src="./SortIndicator.ts"></script>

<style src="./SortIndicator.css"></style>
