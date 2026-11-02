import { createApp, ref, watchEffect } from "vue";
import "./style.css";
import App from "./App.vue";
import { TOKEN_LOAD_TIMEOUT_MS } from "./constants";
import { githubToken, resolveColorScheme, settings } from "./settings";
import { delay } from "./utils/delay";
import { loadGithubToken } from "./utils/githubTokenStorage";

const lightSchemeQuery = matchMedia("(prefers-color-scheme: light)");
const prefersLight = ref(lightSchemeQuery.matches);
lightSchemeQuery.addEventListener("change", (event) => {
    prefersLight.value = event.matches;
});

function mirrorDisplaySettingsOntoRoot() {
    const root = document.documentElement;
    root.dataset.theme = settings.theme;
    root.dataset.colorScheme = resolveColorScheme(settings.theme, prefersLight.value);
    root.style.setProperty("--font-scale", String(settings.fontScale));
    root.style.setProperty("--space-scale", String(settings.spaceScale));
}

/** Keeps a token saved in the menu while this load hung: it is newer. */
async function loadStoredTokenUnlessReplaced() {
    const storedToken = await loadGithubToken();
    githubToken.value ??= storedToken;
}

watchEffect(mirrorDisplaySettingsOntoRoot);

// Decrypting first authenticates the initial fetch; a token arriving after
// the timeout refetches through its watcher.
Promise.race([loadStoredTokenUnlessReplaced(), delay(TOKEN_LOAD_TIMEOUT_MS)]).then(() =>
    createApp(App).mount("#app"),
);
