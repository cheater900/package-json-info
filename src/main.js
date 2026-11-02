import { createApp, watchEffect } from "vue";
import "./style.css";
import App from "./App.vue";
import { TOKEN_LOAD_TIMEOUT_MS } from "./constants";
import { githubToken, settings } from "./settings";
import { loadGithubToken } from "./utils/githubTokenStorage";

watchEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = settings.theme;
    root.style.setProperty("--font-scale", String(settings.fontScale));
    root.style.setProperty("--space-scale", String(settings.spaceScale));
});

// A token saved in the menu while this load hung is newer; keep it.
const tokenLoad = loadGithubToken().then((token) => {
    githubToken.value ??= token;
});

// Decrypt first so the initial fetch is already authenticated, but never
// wait forever: a token arriving late refetches through its watcher.
Promise.race([
    tokenLoad,
    new Promise((resolve) => setTimeout(resolve, TOKEN_LOAD_TIMEOUT_MS)),
]).then(() => createApp(App).mount("#app"));
