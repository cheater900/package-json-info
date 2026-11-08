import { describe, it, expect, vi, afterEach } from "vitest";
import { useExportLock } from "../../../../src/app/composables/useExportLock";

afterEach(() => {
    vi.useRealTimers();
});

describe("useExportLock", () => {
    it("refuses second lock while held", () => {
        const { isExporting, lock } = useExportLock();
        expect(lock()).toBe(true);
        expect(isExporting.value).toBe(true);
        expect(lock()).toBe(false);
    });

    it("unlocks in later task, not at once", () => {
        vi.useFakeTimers({ toFake: ["setTimeout"] });
        const { isExporting, lock, unlockAfterQueuedClicks } = useExportLock();
        lock();
        unlockAfterQueuedClicks();
        expect(isExporting.value).toBe(true);
        vi.runAllTimers();
        expect(isExporting.value).toBe(false);
        expect(lock()).toBe(true);
    });
});
