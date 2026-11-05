import { NPM_REGISTRY_URL } from "../../src/core/constants";
import type { NetworkLogEntry } from "../../src/app/utils/networkLog";
import { subjectOf } from "../helpers/requests";

export const LOG_ENTRY_STARTED_AT = Date.UTC(2026, 10, 11, 9, 30, 0);

/** Successful registry request for `zod`, with `overrides` applied. */
export function networkLogEntry(overrides: Partial<NetworkLogEntry> = {}): NetworkLogEntry {
    return {
        id: 1,
        method: "GET",
        url: `${NPM_REGISTRY_URL}/zod`,
        startedAt: LOG_ENTRY_STARTED_AT,
        state: "success",
        status: 200,
        sizeBytes: 1536,
        error: null,
        package: "demo-app",
        subject: subjectOf(["zod"], ["latestVersion", "license"], "demo-app"),
        replay: async () => new Response(),
        ...overrides,
    };
}
