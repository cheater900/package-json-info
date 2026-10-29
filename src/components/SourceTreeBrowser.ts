import { ref, watch, defineComponent } from "vue";
import { t } from "../i18n";
import { fetchSourceTree } from "../api/sourceTree";
import { settle } from "../utils/settle";
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
        const truncated = ref(false);
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
                truncated.value = false;
                readFile = null;
                error.value = null;
                selectedPath.value = null;
                selectedContent.value = null;
                contentError.value = null;
                if (!sourceTreeRef) {
                    return;
                }
                loading.value = true;
                const result = await settle(() => fetchSourceTree(sourceTreeRef));
                if (isStale) {
                    return;
                }
                loading.value = false;
                if (!result.ok) {
                    error.value = result.error.message;
                    return;
                }
                tree.value = result.value.tree;
                truncated.value = result.value.truncated;
                readFile = result.value.readFile;
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
            const result = await settle(() => readFile(path));
            const isOtherFileSelected = selectedPath.value !== path;
            if (isOtherFileSelected) {
                return;
            }
            loadingContent.value = false;
            if (!result.ok) {
                contentError.value = result.error.message;
                return;
            }
            selectedContent.value = result.value;
        }

        return {
            t,
            loading,
            error,
            tree,
            truncated,
            selectedPath,
            selectedContent,
            loadingContent,
            contentError,
            selectFile,
        };
    },
});
