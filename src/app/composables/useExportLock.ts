import { ref } from "vue";

/** One export at a time: a double click must not save the file twice. */
export function useExportLock() {
    const isExporting = ref(false);

    /** Takes the lock; false when an export already holds it. */
    function lock(): boolean {
        if (isExporting.value) {
            return false;
        }
        isExporting.value = true;
        return true;
    }

    /**
     * A sync render (PDF of a big table) blocks the page; clicks made
     * meanwhile queue up and run after it. Unlock after them, in a later task.
     */
    function unlockAfterQueuedClicks() {
        setTimeout(() => {
            isExporting.value = false;
        });
    }

    return { isExporting, lock, unlockAfterQueuedClicks };
}
