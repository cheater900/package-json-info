import { defineComponent, onMounted, onUnmounted, reactive, ref, useId } from "vue";
import { fetchGithubRateLimit } from "../api/github";
import { clearPackageInfoCache } from "../api/npmPackage";
import { isConfigInt } from "../config";
import {
    GITHUB_TOKEN_PATTERN,
    MAX_CONFIG_INT,
    SETTINGS_FONT_SCALES,
    SETTINGS_SPACE_SCALES,
    SETTINGS_THEMES,
} from "../constants";
import { t } from "../i18n";
import { githubToken, isProxyUrl, settings } from "../settings";
import {
    isTokenStorageAvailable,
    purgeGithubToken,
    saveGithubToken,
} from "../utils/githubTokenStorage";
import { clearLookups } from "../utils/lookupStore";
import { formatPercent } from "../utils/percent";
import { settle } from "../utils/settle";
import IconCheck from "./IconCheck.vue";
import IconGear from "./IconGear.vue";
import IconGlobe from "./IconGlobe.vue";
import IconKey from "./IconKey.vue";
import IconMonitor from "./IconMonitor.vue";
import IconScrollText from "./IconScrollText.vue";
import IconTrash from "./IconTrash.vue";

type SettingsIntKey = "fetchTimeoutMs" | "fetchConcurrency";

/**
 * Gear button opening a dropdown with the GitHub token, network and
 * display settings. Escape closes it and refocuses the gear; a click
 * outside closes it. Network inputs commit on change, only when valid;
 * display selects write straight to `settings`. View network logs closes
 * the panel and emits `open-network-log`.
 */
export default defineComponent({
    components: { IconCheck, IconGear, IconGlobe, IconKey, IconMonitor, IconScrollText, IconTrash },
    emits: ["open-network-log"],
    setup(_props, { emit }) {
        const panelId = useId();
        const isOpen = ref(false);
        const rootRef = ref<HTMLElement | null>(null);
        const gearRef = ref<HTMLButtonElement | null>(null);
        const tokenInputRef = ref<HTMLInputElement | null>(null);
        const tokenDraft = ref("");
        const tokenMessage = ref("");
        const networkErrors = reactive({ proxyUrl: "", fetchTimeoutMs: "", fetchConcurrency: "" });

        function onKeydown(event: KeyboardEvent) {
            if (!isOpen.value || event.key !== "Escape") {
                return;
            }
            isOpen.value = false;
            gearRef.value?.focus();
        }

        function onPointerdown(event: PointerEvent) {
            if (rootRef.value?.contains(event.target as Node)) {
                return;
            }
            isOpen.value = false;
        }

        onMounted(() => {
            window.addEventListener("keydown", onKeydown);
            window.addEventListener("pointerdown", onPointerdown);
        });
        onUnmounted(() => {
            window.removeEventListener("keydown", onKeydown);
            window.removeEventListener("pointerdown", onPointerdown);
        });

        /**
         * Purges the stored token and its in-memory copy. After a half-done
         * save this also drops the stale ciphertext beside the new key, so
         * memory matches what a reload would find. Cached and stored lookups
         * go too: fetched with the token, they may hold private repo data.
         * Memory goes first, so no lookup starts with the token while
         * IndexedDB clears.
         */
        async function forgetToken() {
            githubToken.value = undefined;
            clearPackageInfoCache();
            await Promise.all([purgeGithubToken(), clearLookups()]);
        }

        async function saveToken() {
            const token = tokenDraft.value.trim();
            if (!GITHUB_TOKEN_PATTERN.test(token)) {
                tokenMessage.value = t("settings.token.invalidFormat");
                return;
            }
            const result = await settle(() => saveGithubToken(token));
            if (!result.ok) {
                await forgetToken();
                tokenMessage.value = t("settings.token.saveFailed");
                return;
            }
            githubToken.value = token;
            tokenDraft.value = "";
            tokenMessage.value = t("settings.token.saved");
        }

        async function verifyToken() {
            const token = githubToken.value;
            // Verify button is disabled without a token.
            if (!token) {
                return;
            }
            tokenMessage.value = t("settings.token.verifying");
            const result = await settle(() => fetchGithubRateLimit(token));
            const isAnswerForReplacedToken = githubToken.value !== token;
            if (isAnswerForReplacedToken) {
                return;
            }
            if (!result.ok) {
                tokenMessage.value = t("settings.token.verifyFailed", {
                    error: result.error.message,
                });
                return;
            }
            tokenMessage.value = result.value
                ? t("settings.token.rateLimit", result.value)
                : t("settings.token.invalid");
        }

        async function purgeToken() {
            await forgetToken();
            tokenMessage.value = t("settings.token.purged");
            tokenInputRef.value?.focus();
        }

        function commitProxy(event: Event) {
            const value = (event.target as HTMLInputElement).value.trim();
            if (!isProxyUrl(value)) {
                networkErrors.proxyUrl = t("settings.network.invalidProxy");
                return;
            }
            networkErrors.proxyUrl = "";
            settings.proxyUrl = value;
        }

        function commitInt(key: SettingsIntKey, event: Event) {
            const value = (event.target as HTMLInputElement).valueAsNumber;
            if (!isConfigInt(value)) {
                networkErrors[key] = t("settings.network.invalidInt", { max: MAX_CONFIG_INT });
                return;
            }
            networkErrors[key] = "";
            settings[key] = value;
        }

        function openNetworkLog() {
            isOpen.value = false;
            emit("open-network-log");
        }

        return {
            t,
            panelId,
            isOpen,
            rootRef,
            gearRef,
            githubToken,
            settings,
            isTokenStorageAvailable: isTokenStorageAvailable(),
            tokenInputRef,
            tokenDraft,
            tokenMessage,
            networkErrors,
            themes: SETTINGS_THEMES,
            fontScales: SETTINGS_FONT_SCALES,
            spaceScales: SETTINGS_SPACE_SCALES,
            formatPercent,
            saveToken,
            verifyToken,
            purgeToken,
            commitProxy,
            commitInt,
            openNetworkLog,
        };
    },
});
