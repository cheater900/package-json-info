import { SHARE_STEP_QUERY_PARAM } from "../../src/app/constants";

/** Puts a share link with `steps` in the address bar, after `otherParams`. */
export function openShareLink(steps: string[], otherParams: Record<string, string> = {}) {
    const params = new URLSearchParams(otherParams);
    for (const step of steps) {
        params.append(SHARE_STEP_QUERY_PARAM, step);
    }
    window.history.replaceState(null, "", `/?${params}`);
}

/** Share steps currently in the address bar. */
export function shareSteps() {
    return new URLSearchParams(window.location.search).getAll(SHARE_STEP_QUERY_PARAM);
}
