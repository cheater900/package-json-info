import { SETTINGS_DEFAULTS, githubToken, settings } from "../../src/app/settings";

/** Restores module-global settings and drops the in-memory token. */
export function resetSettings() {
    githubToken.value = undefined;
    Object.assign(settings, SETTINGS_DEFAULTS);
}
