import { NPM_REGISTRY_URL } from "../../src/constants";
import type { NetworkLogEntry } from "../../src/utils/networkLog";
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
        subject: subjectOf(["zod"], ["latestVersion", "license"]),
        replay: async () => new Response(),
        ...overrides,
    };
}
