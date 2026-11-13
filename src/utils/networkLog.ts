import { computed, reactive, shallowReactive } from "vue";
import { observeRequests } from "../api/http";
import type { ObservedRequest, RequestHandle, RequestSubject } from "../api/http";
import { NETWORK_LOG_MAX_ENTRIES } from "../constants";
import { settle } from "./settle";

export type NetworkLogState = "pending" | "success" | "failure";

export type NetworkLogEntry = {
    id: number;
    method: string;
    /** Target URL, never the proxied one. */
    url: string;
    /** Epoch milliseconds. */
    startedAt: number;
    state: NetworkLogState;
    /** HTTP status; null while pending or when no response arrived. */
    status: number | null;
    /** Decoded body size; null until the app reads the whole body, or when it never does. */
    sizeBytes: number | null;
    /** Network error or timeout message, also when the body breaks off; null otherwise. */
    error: string | null;
    subject: RequestSubject | null;
    replay: () => Promise<Response>;
};

export type NetworkLogSummary = {
    total: number;
    success: number;
    failure: number;
    pending: number;
};

/** Every logged request this page load, oldest first, at most NETWORK_LOG_MAX_ENTRIES. */
export const networkLogEntries = shallowReactive<NetworkLogEntry[]>([]);

export const networkLogSummary = computed<NetworkLogSummary>(() => {
    const summary = { total: networkLogEntries.length, success: 0, failure: 0, pending: 0 };
    for (const entry of networkLogEntries) {
        summary[entry.state]++;
    }
    return summary;
});

let nextEntryId = 1;

/** Any non-2xx answer, 404 included, counts as failure. */
function logRequest(request: ObservedRequest): RequestHandle {
    const entry: NetworkLogEntry = reactive({
        id: nextEntryId++,
        method: request.method,
        url: request.url,
        startedAt: Date.now(),
        state: "pending",
        status: null,
        sizeBytes: null,
        error: null,
        subject: request.subject,
        replay: request.replay,
    });
    networkLogEntries.push(entry);
    if (networkLogEntries.length > NETWORK_LOG_MAX_ENTRIES) {
        networkLogEntries.splice(0, networkLogEntries.length - NETWORK_LOG_MAX_ENTRIES);
    }
    return {
        respond(response) {
            entry.state = response.ok ? "success" : "failure";
            entry.status = response.status;
        },
        fail(error) {
            entry.state = "failure";
            entry.error = error.message;
        },
        measure(sizeBytes) {
            entry.sizeBytes = sizeBytes;
        },
    };
}

/** Starts logging every request sent through fetchWithTimeout. Returns the stop function. */
export function startNetworkLog(): () => void {
    return observeRequests(logRequest);
}

/**
 * Sends `entry`'s request again; the outcome shows up as a new entry. The
 * body is drained without keeping it, so the new entry gets its size.
 */
export function replayRequest(entry: NetworkLogEntry): void {
    void settle(async () => {
        const response = await entry.replay();
        await response.body?.pipeTo(new WritableStream());
    });
}
