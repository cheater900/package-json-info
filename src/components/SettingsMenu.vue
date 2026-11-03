<template>
    <div ref="rootRef" class="settings-menu">
        <button
            ref="gearRef"
            type="button"
            class="settings-menu__gear"
            :aria-controls="panelId"
            :aria-label="githubToken ? t('settings.openTokenSet') : t('settings.open')"
            :aria-expanded="isOpen"
            @click="isOpen = !isOpen"
        >
            <icon-gear />
            <span v-if="githubToken" class="settings-menu__badge"></span>
        </button>

        <div
            v-show="isOpen"
            :id="panelId"
            class="settings-menu__panel"
            role="dialog"
            :aria-label="t('settings.title')"
        >
            <fieldset class="settings-menu__section">
                <legend>{{ t("settings.display.legend") }}</legend>
                <div class="settings-menu__item">
                    <label :for="`${panelId}-theme`">{{ t("settings.display.theme") }}</label>
                    <select :id="`${panelId}-theme`" v-model="settings.theme">
                        <option v-for="theme in themes" :key="theme" :value="theme">
                            {{ t(`settings.display.themes.${theme}`) }}
                        </option>
                    </select>
                </div>
                <div class="settings-menu__item">
                    <label :for="`${panelId}-font`">{{ t("settings.display.fontSize") }}</label>
                    <select :id="`${panelId}-font`" v-model="settings.fontScale">
                        <option v-for="scale in fontScales" :key="scale" :value="scale">
                            {{ formatPercent(scale) }}
                        </option>
                    </select>
                </div>
                <div class="settings-menu__item">
                    <label :for="`${panelId}-space`">{{ t("settings.display.padding") }}</label>
                    <select :id="`${panelId}-space`" v-model="settings.spaceScale">
                        <option v-for="scale in spaceScales" :key="scale" :value="scale">
                            {{ formatPercent(scale) }}
                        </option>
                    </select>
                </div>
            </fieldset>

            <fieldset class="settings-menu__section">
                <legend>{{ t("settings.network.legend") }}</legend>
                <div class="settings-menu__item">
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
                </div>
                <div class="settings-menu__item">
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
                </div>
                <div class="settings-menu__item">
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
                </div>
                <p
                    v-for="(error, key) in networkErrors"
                    v-show="error"
                    :key="key"
                    class="settings-menu__error"
                    role="alert"
                >
                    {{ error }}
                </p>
                <button type="button" class="settings-menu__logs" @click="openNetworkLog">
                    {{ t("settings.network.viewLogs") }}
                </button>
            </fieldset>

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
        </div>
    </div>
</template>

<script lang="ts" src="./SettingsMenu.ts"></script>

<style src="./SettingsMenu.css"></style>
