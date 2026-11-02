<template>
    <div class="settings-menu">
        <button
            type="button"
            class="settings-menu__gear"
            :popovertarget="panelId"
            :aria-label="githubToken ? t('settings.openTokenSet') : t('settings.open')"
            :aria-expanded="isOpen"
        >
            <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                width="1.1em"
                height="1.1em"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
            >
                <circle cx="12" cy="12" r="3" />
                <path
                    d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
                />
            </svg>
            <span v-if="githubToken" class="settings-menu__badge"></span>
        </button>

        <div
            :id="panelId"
            class="settings-menu__panel"
            popover="auto"
            role="dialog"
            :aria-label="t('settings.title')"
            @toggle="onToggle"
        >
            <fieldset class="settings-menu__section">
                <legend>{{ t("settings.token.legend") }}</legend>
                <p v-if="!isTokenStorageAvailable" class="settings-menu__hint">
                    {{ t("settings.token.unavailable") }}
                </p>
                <template v-else>
                    <p class="settings-menu__status">
                        {{ githubToken ? t("settings.token.set") : t("settings.token.notSet") }}
                    </p>
                    <form class="settings-menu__row" @submit.prevent="saveToken">
                        <label :for="`${panelId}-token`" class="visually-hidden">
                            {{ t("settings.token.label") }}
                        </label>
                        <input
                            :id="`${panelId}-token`"
                            ref="tokenInputRef"
                            v-model="tokenDraft"
                            type="password"
                            autocomplete="off"
                            spellcheck="false"
                            :placeholder="t('settings.token.label')"
                        />
                        <button type="submit">{{ t("settings.token.save") }}</button>
                    </form>
                    <div class="settings-menu__row">
                        <button type="button" :disabled="!githubToken" @click="verifyToken">
                            {{ t("settings.token.verify") }}
                        </button>
                        <button type="button" :disabled="!githubToken" @click="purgeToken">
                            {{ t("settings.token.purge") }}
                        </button>
                    </div>
                    <p v-if="tokenMessage" role="status">
                        {{ tokenMessage }}
                    </p>
                    <p class="settings-menu__hint">{{ t("settings.token.hint") }}</p>
                </template>
            </fieldset>

            <fieldset class="settings-menu__section">
                <legend>{{ t("settings.network.legend") }}</legend>
                <label :for="`${panelId}-proxy`">{{ t("settings.network.proxy") }}</label>
                <input
                    :id="`${panelId}-proxy`"
                    type="url"
                    :value="settings.proxyUrl"
                    :placeholder="t('settings.network.proxyPlaceholder')"
                    :aria-invalid="!!networkErrors.proxyUrl"
                    @change="commitProxy"
                />
                <p class="settings-menu__hint">{{ t("settings.network.proxyHint") }}</p>
                <label :for="`${panelId}-timeout`">{{ t("settings.network.timeout") }}</label>
                <input
                    :id="`${panelId}-timeout`"
                    type="number"
                    min="1"
                    step="1"
                    :value="settings.fetchTimeoutMs"
                    :aria-invalid="!!networkErrors.fetchTimeoutMs"
                    @change="commitInt('fetchTimeoutMs', $event)"
                />
                <label :for="`${panelId}-concurrency`">
                    {{ t("settings.network.concurrency") }}
                </label>
                <input
                    :id="`${panelId}-concurrency`"
                    type="number"
                    min="1"
                    step="1"
                    :value="settings.fetchConcurrency"
                    :aria-invalid="!!networkErrors.fetchConcurrency"
                    @change="commitInt('fetchConcurrency', $event)"
                />
                <p
                    v-for="(error, key) in networkErrors"
                    v-show="error"
                    :key="key"
                    class="settings-menu__error"
                    role="alert"
                >
                    {{ error }}
                </p>
            </fieldset>

            <fieldset class="settings-menu__section">
                <legend>{{ t("settings.display.legend") }}</legend>
                <label :for="`${panelId}-theme`">{{ t("settings.display.theme") }}</label>
                <select :id="`${panelId}-theme`" v-model="settings.theme">
                    <option v-for="theme in themes" :key="theme" :value="theme">
                        {{ t(`settings.display.themes.${theme}`) }}
                    </option>
                </select>
                <label :for="`${panelId}-font`">{{ t("settings.display.fontSize") }}</label>
                <select :id="`${panelId}-font`" v-model="settings.fontScale">
                    <option v-for="scale in fontScales" :key="scale" :value="scale">
                        {{ percent(scale) }}
                    </option>
                </select>
                <label :for="`${panelId}-space`">{{ t("settings.display.padding") }}</label>
                <select :id="`${panelId}-space`" v-model="settings.spaceScale">
                    <option v-for="scale in spaceScales" :key="scale" :value="scale">
                        {{ percent(scale) }}
                    </option>
                </select>
            </fieldset>
        </div>
    </div>
</template>

<script lang="ts" src="./SettingsMenu.ts"></script>

<style src="./SettingsMenu.css"></style>
