import { observeRequests } from "../../src/core/api/http";
import type { ObservedRequest, RequestSubject } from "../../src/core/api/http";

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

/** Subject listing `dependencies` and `columns` under `rootPackage`, for `toEqual` checks. */
export function subjectOf(
    dependencies: string[],
    columns: string[],
    rootPackage: string | null = null,
): RequestSubject {
    return { package: rootPackage, dependencies: new Set(dependencies), columns: new Set(columns) };
}
