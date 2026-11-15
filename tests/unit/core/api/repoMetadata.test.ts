import { describe, it, expect, vi, afterEach } from "vitest";
import {
    EMPTY_COMMIT_ACTIVITY,
    fetchRepoCommitActivity,
} from "../../../../src/core/api/repoMetadata";
import { HttpError } from "../../../../src/core/api/http";
import {
    HTTP_STATUS,
    jsonResponse,
    statusResponse,
    streamedResponse,
} from "../../../helpers/fetchMock";

const GITHUB_SLUG = { host: "github.com", owner: "o", repo: "r" };
const NOW = new Date("2025-06-15T12:00:00Z");

afterEach(() => {
    vi.useRealTimers();
});

describe("fetchRepoCommitActivity", () => {
    it("requests 12 commits since 365 days ago", async () => {
        vi.useFakeTimers({ now: NOW });
        const fetchMock = vi.fn(async () => jsonResponse([]));
        vi.stubGlobal("fetch", fetchMock);

        await fetchRepoCommitActivity(GITHUB_SLUG, {});

        const url = new URL((fetchMock.mock.calls[0] as unknown as string[])[0]);
        expect(url.pathname).toBe("/repos/o/r/commits");
        expect(url.searchParams.get("since")).toBe("2024-06-15T12:00:00.000Z");
        expect(url.searchParams.get("per_page")).toBe("12");
    });

    it("returns empty activity without request for non-GitHub host", async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);

        const result = await fetchRepoCommitActivity({ ...GITHUB_SLUG, host: "gitlab.com" }, {});

        expect(result).toBe(EMPTY_COMMIT_ACTIVITY);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("returns empty activity on 404", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => statusResponse(HTTP_STATUS.notFound)),
        );

        expect(await fetchRepoCommitActivity(GITHUB_SLUG, {})).toBe(EMPTY_COMMIT_ACTIVITY);
    });

    it("returns 0 commits + null date on 409 empty repo", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => statusResponse(HTTP_STATUS.conflict)),
        );

        expect(await fetchRepoCommitActivity(GITHUB_SLUG, {})).toEqual({
            lastCommitDate: null,
            commitsLastYear: 0,
        });
    });

    it("throws HttpError on other non-2xx status", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => statusResponse(HTTP_STATUS.serverError)),
        );

        await expect(fetchRepoCommitActivity(GITHUB_SLUG, {})).rejects.toBeInstanceOf(HttpError);
    });

    it.each([
        ["404", HTTP_STATUS.notFound],
        ["409", HTTP_STATUS.conflict],
        ["500", HTTP_STATUS.serverError],
    ])("cancels unread body on %s", async (_label, status) => {
        const { response, cancelSource } = streamedResponse(status);
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => response),
        );

        await fetchRepoCommitActivity(GITHUB_SLUG, {}).catch(() => null);

        await vi.waitFor(() => {
            expect(cancelSource).toHaveBeenCalled();
        });
    });

    it("leaves body of 200 answer uncancelled", async () => {
        const cancelSource = vi.fn();
        const body = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(new TextEncoder().encode("[]"));
                controller.close();
            },
            cancel: cancelSource,
        });
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response(body, { status: HTTP_STATUS.ok })),
        );

        await fetchRepoCommitActivity(GITHUB_SLUG, {});

        expect(cancelSource).not.toHaveBeenCalled();
    });

    it("throws on malformed body", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => jsonResponse({ message: "x" })),
        );

        await expect(fetchRepoCommitActivity(GITHUB_SLUG, {})).rejects.toThrow();
    });

    it("counts commits + takes date of newest dated commit", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () =>
                jsonResponse([
                    { commit: { committer: null } },
                    { commit: { committer: { date: "2025-05-01T00:00:00Z" } } },
                    { commit: { committer: { date: "2025-01-01T00:00:00Z" } } },
                ]),
            ),
        );

        expect(await fetchRepoCommitActivity(GITHUB_SLUG, {})).toEqual({
            lastCommitDate: "2025-05-01T00:00:00Z",
            commitsLastYear: 3,
        });
    });
});
