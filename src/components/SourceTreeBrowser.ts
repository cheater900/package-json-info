import { ref, watch, defineComponent } from "vue";
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
            async (sourceTreeRef) => {
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
                try {
                    const result = await fetchSourceTree(sourceTreeRef);
                    tree.value = result.tree;
                    readFile = result.readFile;
                } catch (err) {
                    error.value = err.message;
                } finally {
                    loading.value = false;
                }
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
            try {
                selectedContent.value = await readFile(path);
            } catch (err) {
                contentError.value = err.message;
            } finally {
                loadingContent.value = false;
            }
        }

        return {
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
