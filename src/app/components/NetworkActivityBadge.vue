<template>
    <Transition name="network-badge">
        <div v-if="isVisible" class="network-badge">
            <button
                type="button"
                class="network-badge__open"
                :aria-label="openLabel"
                :title="openLabel"
                @click="$emit('open')"
            >
                <span class="network-badge__bar" aria-hidden="true">
                    <span
                        v-for="state in BADGE_STATES"
                        :key="state"
                        :class="['network-badge__segment', `network-badge__segment--${state}`]"
                        :style="{ width: segmentWidth(state) }"
                    ></span>
                </span>
                <span class="network-badge__counts">
                    <span
                        v-for="state in BADGE_STATES"
                        :key="state"
                        :class="['network-badge__count', `network-badge__count--${state}`]"
                    >
                        <component :is="STATE_ICONS[state]" />
                        {{ summary[state] }}
                    </span>
                </span>
            </button>
            <button
                type="button"
                class="network-badge__dismiss"
                :aria-label="t('networkBadge.dismiss')"
                :title="t('networkBadge.dismiss')"
                @click="dismiss"
            >
                <icon-cross />
            </button>
        </div>
    </Transition>
</template>

<script lang="ts" src="./NetworkActivityBadge.ts"></script>

<style src="./NetworkActivityBadge.css"></style>
