import { defineComponent, reactive, ref, useId } from "vue";
import { fetchGithubRateLimit } from "../api/github";
import {
    GITHUB_TOKEN_PATTERN,
    SETTINGS_FONT_SCALES,
    SETTINGS_SPACE_SCALES,
    SETTINGS_THEMES,
} from "../constants";
import { t } from "../i18n";
import { githubToken, isProxyUrl, isSettingsInt, settings } from "../settings";
import {
    isTokenStorageAvailable,
    purgeGithubToken,
    saveGithubToken,
} from "../utils/githubTokenStorage";
import { settle } from "../utils/settle";

type SettingsIntKey = "fetchTimeoutMs" | "fetchConcurrency";

/**
 * Gear button opening a native popover with the GitHub token, network and
 * display settings. Network inputs commit on change, only when valid;
 * display selects write straight to `settings`.
 */
export default defineComponent({
    setup() {
        const panelId = useId();
        const isOpen = ref(false);
        const tokenInputRef = ref<HTMLInputElement | null>(null);
        const tokenDraft = ref("");
        const tokenMessage = ref("");
        const networkErrors = reactive({ proxyUrl: "", fetchTimeoutMs: "", fetchConcurrency: "" });

        function onToggle(event: ToggleEvent) {
            isOpen.value = event.newState === "open";
        }

        async function saveToken() {
            const token = tokenDraft.value.trim();
            if (!GITHUB_TOKEN_PATTERN.test(token)) {
                tokenMessage.value = t("settings.token.invalidFormat");
                return;
            }
            const result = await settle(() => saveGithubToken(token));
            if (!result.ok) {
                // A half-done save leaves the old ciphertext beside the new
                // key; drop both so memory matches what a reload would find.
                await purgeGithubToken();
                githubToken.value = undefined;
                tokenMessage.value = t("settings.token.saveFailed");
                return;
            }
            githubToken.value = token;
            tokenDraft.value = "";
            tokenMessage.value = t("settings.token.saved");
        }

        async function verifyToken() {
            tokenMessage.value = t("settings.token.verifying");
            const result = await settle(() => fetchGithubRateLimit(githubToken.value));
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
            await purgeGithubToken();
            githubToken.value = undefined;
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

        function percent(scale: number): string {
            return `${Math.round(scale * 100)}%`;
        }

        function commitInt(key: SettingsIntKey, event: Event) {
            const value = (event.target as HTMLInputElement).valueAsNumber;
            if (!isSettingsInt(value)) {
                networkErrors[key] = t("settings.network.invalidInt");
                return;
            }
            networkErrors[key] = "";
            settings[key] = value;
        }

        return {
            t,
            panelId,
            isOpen,
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
            percent,
            onToggle,
            saveToken,
            verifyToken,
            purgeToken,
            commitProxy,
            commitInt,
        };
    },
});
