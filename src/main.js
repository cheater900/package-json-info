import { createApp, watchEffect } from "vue";
import "./style.css";
import App from "./App.vue";
import { githubToken, settings } from "./settings";
import { loadGithubToken } from "./utils/githubTokenStorage";

watchEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = settings.theme;
    root.style.setProperty("--font-scale", String(settings.fontScale));
    root.style.setProperty("--space-scale", String(settings.spaceScale));
});

// Decrypt first so the initial fetch is already authenticated.
loadGithubToken().then((token) => {
    githubToken.value = token;
    createApp(App).mount("#app");
});
