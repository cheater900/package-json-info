import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { fetchWithTimeout } from "../../../src/api/http";
import {
    networkLogEntries,
    networkLogSummary,
    replayRequest,
    startNetworkLog,
} from "../../../src/utils/networkLog";
import { settle } from "../../../src/utils/settle";
import { HTTP_STATUS } from "../../helpers/fetchMock";
import { resetSettings } from "../../helpers/settings";

const NETWORK_LOG_MAX_ENTRIES_STUB = vi.hoisted(() => 3);

vi.mock("../../../src/constants", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../../../src/constants")>()),
    NETWORK_LOG_MAX_ENTRIES: NETWORK_LOG_MAX_ENTRIES_STUB,
}));

const SUBJECT = { packages: new Set(["left-pad"]), columns: new Set(["gitStars"]) };

let stopNetworkLog = () => {};

function stubFetchStatus(status: number, body = "hello") {
    vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response(body, { status })),
    );
}

beforeEach(() => {
    networkLogEntries.splice(0);
    stopNetworkLog = startNetworkLog();
});

afterEach(() => {
    stopNetworkLog();
    resetSettings();
});

describe("networkLog", () => {
    it("logs pending request, then success with body size", async () => {
        let resolveFetch = (_response: Response) => {};
        vi.stubGlobal(
            "fetch",
            vi.fn(
                () =>
                    new Promise<Response>((resolve) => {
                        resolveFetch = resolve;
                    }),
            ),
        );

        const request = fetchWithTimeout("https://a.test/x", { method: "POST" }, SUBJECT);

        expect(networkLogEntries).toHaveLength(1);
        expect(networkLogEntries[0]).toMatchObject({
            method: "POST",
            url: "https://a.test/x",
            state: "pending",
            status: null,
            subject: SUBJECT,
        });
        resolveFetch(new Response("hello", { status: HTTP_STATUS.ok }));
        await request;
        expect(networkLogEntries[0]).toMatchObject({ state: "success", status: HTTP_STATUS.ok });
        await vi.waitFor(() => {
            expect(networkLogEntries[0].sizeBytes).toBe(5);
        });
    });

    it("logs 404 as failure with status", async () => {
        stubFetchStatus(HTTP_STATUS.notFound);

        await fetchWithTimeout("https://a.test/x");

        expect(networkLogEntries[0]).toMatchObject({
            state: "failure",
            status: HTTP_STATUS.notFound,
            error: null,
        });
    });

    it("logs thrown error as failure with message, null status", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => {
                throw new Error("network down");
            }),
        );

        await settle(() => fetchWithTimeout("https://a.test/x"));

        expect(networkLogEntries[0]).toMatchObject({
            state: "failure",
            status: null,
            error: "network down",
        });
    });

    it("drops oldest entries past NETWORK_LOG_MAX_ENTRIES", async () => {
        stubFetchStatus(HTTP_STATUS.ok);

        for (let i = 0; i < NETWORK_LOG_MAX_ENTRIES_STUB + 2; i++) {
            await fetchWithTimeout(`https://a.test/${i}`);
        }

        expect(networkLogEntries.map((entry) => entry.url)).toEqual([
            "https://a.test/2",
            "https://a.test/3",
            "https://a.test/4",
        ]);
    });

    it("counts entries by state in summary", async () => {
        stubFetchStatus(HTTP_STATUS.ok);
        await fetchWithTimeout("https://a.test/ok");
        stubFetchStatus(HTTP_STATUS.serverError);
        await fetchWithTimeout("https://a.test/fail");
        vi.stubGlobal(
            "fetch",
            vi.fn(() => new Promise(() => {})),
        );
        void fetchWithTimeout("https://a.test/pending");

        expect(networkLogSummary.value).toEqual({ total: 3, success: 1, failure: 1, pending: 1 });
    });

    it("logs replayed request as new entry", async () => {
        stubFetchStatus(HTTP_STATUS.notFound);
        await fetchWithTimeout("https://a.test/x", {}, SUBJECT);
        stubFetchStatus(HTTP_STATUS.ok);

        replayRequest(networkLogEntries[0]);

        await vi.waitFor(() => {
            expect(networkLogEntries).toHaveLength(2);
            expect(networkLogEntries[1]).toMatchObject({
                url: "https://a.test/x",
                state: "success",
                subject: SUBJECT,
            });
        });
        expect(networkLogEntries[1].id).toBeGreaterThan(networkLogEntries[0].id);
    });

    it("stops logging after stop function", async () => {
        stubFetchStatus(HTTP_STATUS.ok);
        stopNetworkLog();

        await fetchWithTimeout("https://a.test/x");

        expect(networkLogEntries).toHaveLength(0);
    });
});
