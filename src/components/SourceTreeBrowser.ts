import { ref, watch, defineComponent } from "vue";
import { t } from "../i18n";
import { fetchSourceTree } from "../api/sourceTree";
import FileTreeItem from "./FileTreeItem.vue";

export default defineComponent({
    components: { FileTreeItem },
    props: {
        dependencyName: {
            type: String,
            default: null,
        },
        sourceTree: {
            type: Object,
            default: null,
        },
    },
    setup(props) {
        const loading = ref(false);
        const error = ref(null);
        const tree = ref([]);
        const selectedPath = ref(null);
        const selectedContent = ref(null);
        const loadingContent = ref(false);
        const contentError = ref(null);
        // Not reactive state - just a closure held for the currently-open
        // tree's lazy per-file content lookup.
        let readFile = null;

        watch(
            () => props.sourceTree,
            async (sourceTreeRef, _previous, onCleanup) => {
                // A tree swapped out mid-download must not overwrite the new one.
                let isStale = false;
                onCleanup(() => {
                    isStale = true;
                });
                tree.value = [];
                readFile = null;
                error.value = null;
                selectedPath.value = null;
                selectedContent.value = null;
                contentError.value = null;
                if (!sourceTreeRef) {
                    return;
                }
                loading.value = true;
                let result;
                let failure;
                try {
                    result = await fetchSourceTree(sourceTreeRef);
                } catch (err) {
                    failure = err;
                }
                if (isStale) {
                    return;
                }
                loading.value = false;
                if (failure) {
                    error.value = failure.message;
                    return;
                }
                tree.value = result.tree;
                readFile = result.readFile;
            },
            // Fires on mount too - the parent only mounts this component once
            // there's a dependency to show, so sourceTree is already set.
            { immediate: true },
        );

        async function selectFile(path) {
            selectedPath.value = path;
            selectedContent.value = null;
            contentError.value = null;
            if (!readFile) {
                return;
            }
            loadingContent.value = true;
            let content;
            let failure;
            try {
                content = await readFile(path);
            } catch (err) {
                failure = err;
            }
            // Another file clicked while this one loaded: its result wins.
            if (selectedPath.value !== path) {
                return;
            }
            loadingContent.value = false;
            if (failure) {
                contentError.value = failure.message;
                return;
            }
            selectedContent.value = content;
        }

        return {
            t,
            loading,
            error,
            tree,
            selectedPath,
            selectedContent,
            loadingContent,
            contentError,
            selectFile,
        };
    },
});
