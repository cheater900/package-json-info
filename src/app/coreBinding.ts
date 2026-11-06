import { reactive } from "vue";
import { configureCore } from "../core/runtime";
import { githubToken, settings } from "./settings";
import { indexedDbLookupStore } from "./utils/lookupStore";

/** Feeds app settings, Vue reactivity and the IndexedDB lookup store to core. */
export function bindCore(): void {
    configureCore({
        settings: () => ({
            proxyUrl: settings.proxyUrl,
            fetchTimeoutMs: settings.fetchTimeoutMs,
            fetchConcurrency: settings.fetchConcurrency,
            githubToken: githubToken.value,
        }),
        // Subjects hold no refs, so reactive() unwrapping changes no type.
        trackSubject: (subject) => reactive(subject) as typeof subject,
        lookupStore: indexedDbLookupStore,
    });
}
