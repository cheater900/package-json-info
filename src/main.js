import { createApp } from "vue";
import "./style.css";
import App from "./App.vue";
import { githubToken } from "./settings";
import { loadGithubToken } from "./utils/githubTokenStorage";

// Decrypt first so the initial fetch is already authenticated.
loadGithubToken().then((token) => {
    githubToken.value = token;
    createApp(App).mount("#app");
});
