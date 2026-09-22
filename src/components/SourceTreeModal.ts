import { ref, computed, watch, defineComponent } from "vue";
import { fetchSourceTree } from "../utils/sourceTree";
import FileTreeItem from "./FileTreeItem.vue";
import Modal from "./Modal.vue";

export default defineComponent({
    components: { FileTreeItem, Modal },
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
    emits: ["close"],
    setup(props, { emit }) {
        const isOpen = computed(() => props.sourceTree != null);
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
            async (ref_) => {
                tree.value = [];
                readFile = null;
                error.value = null;
                selectedPath.value = null;
                selectedContent.value = null;
                contentError.value = null;
                if (!ref_) return;

                loading.value = true;
                try {
                    const result = await fetchSourceTree(ref_);
                    tree.value = result.tree;
                    readFile = result.readFile;
                } catch (err) {
                    error.value = err instanceof Error ? err.message : String(err);
                } finally {
                    loading.value = false;
                }
            },
            // Fires on mount too, not just later changes - guards against
            // this component ever being created with sourceTree already set
            // rather than transitioning from null.
            { immediate: true },
        );

        async function selectFile(path) {
            selectedPath.value = path;
            selectedContent.value = null;
            contentError.value = null;
            if (!readFile) return;

            loadingContent.value = true;
            try {
                selectedContent.value = await readFile(path);
            } catch (err) {
                contentError.value = err instanceof Error ? err.message : String(err);
            } finally {
                loadingContent.value = false;
            }
        }

        function close() {
            emit("close");
        }

        return {
            isOpen,
            loading,
            error,
            tree,
            selectedPath,
            selectedContent,
            loadingContent,
            contentError,
            selectFile,
            close,
        };
    },
});
