import { observeRequests } from "../../src/api/http";
import type { ObservedRequest, RequestSubject } from "../../src/api/http";

/** Records every request sent through fetchWithTimeout until `stop` runs. */
export function recordRequests() {
    const requests: ObservedRequest[] = [];
    const stop = observeRequests((request) => {
        requests.push(request);
        return { respond: () => {}, fail: () => {}, measure: () => {} };
    });
    return { requests, stop };
}

/** Subjects of recorded requests whose URL contains `pattern`, in send order. */
export function subjectsOf(
    requests: readonly ObservedRequest[],
    pattern: string,
): (RequestSubject | null)[] {
    return requests.filter((request) => request.url.includes(pattern)).map((r) => r.subject);
}

/** Subject listing `packages` and `columns`, for `toEqual` checks. */
export function subjectOf(packages: string[], columns: string[]): RequestSubject {
    return { packages: new Set(packages), columns: new Set(columns) };
}
