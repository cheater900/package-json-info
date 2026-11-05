import { MAX_SHARE_STEP_LENGTH, MAX_SHARE_STEPS, SHARE_STEP_QUERY_PARAM } from "../constants";
import type { EntrySource, HistoryEntry } from "./packageJsonHistory";
import { isHttpUrl } from "../../core/utils/url";

const STEP_PREFIX_DEPENDENCY = "dep:";
const STEP_PREFIX_URL = "url:";
const STEP_PREFIX_WORKSPACE = "ws:";
/** Version "@" search starts past a scope's leading "@" (@scope/pkg@^1.0.0). */
const SCOPE_MARKER_LENGTH = "@".length;

function encodeStep(source: EntrySource): string {
    if (source.kind === "url") {
        return `${STEP_PREFIX_URL}${source.url}`;
    }
    if (source.kind === "workspace") {
        return `${STEP_PREFIX_WORKSPACE}${source.path}`;
    }
    return `${STEP_PREFIX_DEPENDENCY}${source.name}@${source.version}`;
}

/**
 * Share steps for history entries `0..index`. Entries a link cannot reload
 * (clipboard, file, built-in package.json) are left out.
 */
export function encodeSteps(history: HistoryEntry[], index: number): string[] {
    return history
        .slice(0, index + 1)
        .flatMap((entry) => (entry.source ? [encodeStep(entry.source)] : []));
}

/**
 * Splits `name@range` at the first "@" past the scope marker: a package
 * name holds no other "@", a range can (`npm:other@^1.0.0`, git URLs).
 */
function parseDependencyStep(spec: string): EntrySource | null {
    const separator = spec.indexOf("@", SCOPE_MARKER_LENGTH);
    if (separator === -1) {
        return null;
    }
    return {
        kind: "dependency",
        name: spec.slice(0, separator),
        version: spec.slice(separator + 1),
    };
}

function parseStep(step: string): EntrySource | null {
    if (step.length > MAX_SHARE_STEP_LENGTH) {
        return null;
    }
    if (step.startsWith(STEP_PREFIX_URL)) {
        const url = step.slice(STEP_PREFIX_URL.length);
        return isHttpUrl(url) ? { kind: "url", url } : null;
    }
    if (step.startsWith(STEP_PREFIX_WORKSPACE)) {
        return { kind: "workspace", path: step.slice(STEP_PREFIX_WORKSPACE.length) };
    }
    if (step.startsWith(STEP_PREFIX_DEPENDENCY)) {
        return parseDependencyStep(step.slice(STEP_PREFIX_DEPENDENCY.length));
    }
    return null;
}

/** Only a repo URL or another workspace leaves a workspace list to pick from. */
function canFollow(source: EntrySource, previous: EntrySource | undefined): boolean {
    return (
        source.kind !== "workspace" || previous?.kind === "url" || previous?.kind === "workspace"
    );
}

/**
 * Reads the share steps of a `location.search` string. Anyone can craft a
 * link, so the list ends at the first unknown, malformed, oversized or
 * misplaced step, and at MAX_SHARE_STEPS.
 */
export function parseSteps(search: string): EntrySource[] {
    const steps = new URLSearchParams(search).getAll(SHARE_STEP_QUERY_PARAM);
    const sources: EntrySource[] = [];
    for (const step of steps.slice(0, MAX_SHARE_STEPS)) {
        const source = parseStep(step);
        if (!source || !canFollow(source, sources.at(-1))) {
            break;
        }
        sources.push(source);
    }
    return sources;
}

/**
 * `href` with its share steps replaced by `steps`, other params kept, as an
 * absolute URL for `history.replaceState` (see hrefWithInputUrlParam).
 */
export function hrefWithSteps(href: string, steps: string[]): string {
    const url = new URL(href);
    url.searchParams.delete(SHARE_STEP_QUERY_PARAM);
    for (const step of steps) {
        url.searchParams.append(SHARE_STEP_QUERY_PARAM, step);
    }
    return url.href;
}
