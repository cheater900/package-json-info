<template>
    <span
        ref="rootRef"
        class="text-wrapped"
        :class="{
            'text-wrapped--overflowing': isOverflowing,
            'text-wrapped--expanded': isExpanded,
        }"
        :style="clipStyle"
        @mouseenter="onMouseEnter"
        @click="onClick"
    >
        <slot />
    </span>
</template>

<script lang="ts" src="./TextWrapped.ts"></script>

<style src="./TextWrapped.css"></style>
