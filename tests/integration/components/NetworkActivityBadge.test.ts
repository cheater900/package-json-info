import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import NetworkActivityBadge from "../../../src/app/components/NetworkActivityBadge.vue";
import { NETWORK_BADGE_HIDE_DELAY_MS } from "../../../src/app/constants";
import { networkLogBatch, networkLogBatchCount } from "../../../src/app/utils/networkLog";
import type { NetworkLogEntry } from "../../../src/app/utils/networkLog";
import { networkLogEntry } from "../../fixtures/networkLog";
import { HTTP_STATUS } from "../../helpers/fetchMock";

const successEntry = networkLogEntry({ id: 1 });
const failureEntry = networkLogEntry({ id: 2, state: "failure", status: HTTP_STATUS.serverError });
const pendingEntry = networkLogEntry({ id: 3, state: "pending", status: null });

function mountBadge(entries: NetworkLogEntry[]) {
    networkLogBatch.push(...entries);
    return mount(NetworkActivityBadge);
}

function isShown(wrapper: ReturnType<typeof mountBadge>) {
    return wrapper.find(".network-badge").exists();
}

function counts(wrapper: ReturnType<typeof mountBadge>) {
    return wrapper.findAll(".network-badge__count").map((count) => count.text());
}

function segmentWidths(wrapper: ReturnType<typeof mountBadge>) {
    return wrapper
        .findAll(".network-badge__segment")
        .map((segment) => (segment.element as HTMLElement).style.width);
}

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
    networkLogBatch.splice(0);
});

describe("NetworkActivityBadge", () => {
    it("hides with empty batch", () => {
        expect(isShown(mountBadge([]))).toBe(false);
    });

    it("shows success, failure, pending counts", () => {
        const wrapper = mountBadge([successEntry, successEntry, failureEntry, pendingEntry]);

        expect(counts(wrapper)).toEqual(["2", "1", "1"]);
    });

    it("sizes bar segments by count share", () => {
        const wrapper = mountBadge([successEntry, successEntry, failureEntry, pendingEntry]);

        expect(segmentWidths(wrapper)).toEqual(["50%", "25%", "25%"]);
    });

    it("labels open button with summary", () => {
        const wrapper = mountBadge([successEntry, pendingEntry]);

        expect(wrapper.find(".network-badge__open").attributes("aria-label")).toBe(
            "Open network logs (2 requests: 0 failed, 1 pending, 1 successful)",
        );
    });

    it("stays while request pending", () => {
        const wrapper = mountBadge([pendingEntry]);

        vi.advanceTimersByTime(NETWORK_BADGE_HIDE_DELAY_MS);

        expect(isShown(wrapper)).toBe(true);
    });

    it("hides after delay once batch settles without failures", async () => {
        const wrapper = mountBadge([successEntry, pendingEntry]);
        networkLogBatch[1] = { ...pendingEntry, state: "success" };
        await nextTick();

        vi.advanceTimersByTime(NETWORK_BADGE_HIDE_DELAY_MS - 1);
        await nextTick();
        expect(isShown(wrapper)).toBe(true);
        vi.advanceTimersByTime(1);
        await nextTick();
        expect(isShown(wrapper)).toBe(false);
    });

    it("stays after delay with failure", async () => {
        const wrapper = mountBadge([successEntry, failureEntry]);

        vi.advanceTimersByTime(NETWORK_BADGE_HIDE_DELAY_MS);
        await nextTick();

        expect(isShown(wrapper)).toBe(true);
    });

    it("dismiss button hides badge", async () => {
        const wrapper = mountBadge([failureEntry]);

        await wrapper.find(".network-badge__dismiss").trigger("click");

        expect(isShown(wrapper)).toBe(false);
    });

    it("reshows on new batch after dismiss", async () => {
        const wrapper = mountBadge([failureEntry]);
        await wrapper.find(".network-badge__dismiss").trigger("click");

        networkLogBatch.splice(0, 1, pendingEntry);
        networkLogBatchCount.value++;
        await nextTick();

        expect(isShown(wrapper)).toBe(true);
        expect(counts(wrapper)).toEqual(["0", "0", "1"]);
    });

    it("stays dismissed when cap trims oldest batch entry", async () => {
        const wrapper = mountBadge([failureEntry, pendingEntry]);
        await wrapper.find(".network-badge__dismiss").trigger("click");

        networkLogBatch.splice(0, 1);
        networkLogBatch.push(
            networkLogEntry({ id: 4, state: "failure", status: HTTP_STATUS.serverError }),
        );
        await nextTick();

        expect(isShown(wrapper)).toBe(false);
    });

    it("stays after body failure following settle", async () => {
        const wrapper = mountBadge([successEntry]);
        networkLogBatch[0] = { ...successEntry, state: "failure", error: "aborted" };
        await nextTick();

        vi.advanceTimersByTime(NETWORK_BADGE_HIDE_DELAY_MS);
        await nextTick();

        expect(isShown(wrapper)).toBe(true);
    });

    it("reshows on body failure after auto-hide", async () => {
        const wrapper = mountBadge([successEntry]);
        vi.advanceTimersByTime(NETWORK_BADGE_HIDE_DELAY_MS);
        await nextTick();

        networkLogBatch[0] = { ...successEntry, state: "failure", error: "aborted" };
        await nextTick();

        expect(isShown(wrapper)).toBe(true);
    });

    it("stays dismissed on body failure after dismiss", async () => {
        const wrapper = mountBadge([failureEntry, successEntry]);
        await wrapper.find(".network-badge__dismiss").trigger("click");

        networkLogBatch[1] = { ...successEntry, state: "failure", error: "aborted" };
        await nextTick();

        expect(isShown(wrapper)).toBe(false);
    });

    it("cancels pending hide on new batch", async () => {
        const wrapper = mountBadge([successEntry]);
        vi.advanceTimersByTime(NETWORK_BADGE_HIDE_DELAY_MS - 1);

        networkLogBatch.splice(0, 1, pendingEntry);
        networkLogBatchCount.value++;
        await nextTick();
        vi.advanceTimersByTime(NETWORK_BADGE_HIDE_DELAY_MS);
        await nextTick();

        expect(isShown(wrapper)).toBe(true);
    });

    it("emits open on main button click", async () => {
        const wrapper = mountBadge([successEntry]);

        await wrapper.find(".network-badge__open").trigger("click");

        expect(wrapper.emitted("open")).toHaveLength(1);
    });
});
