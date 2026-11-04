export type SemverTuple = [number, number, number];

/** Lookbehind anchors the match at a digit run's start; without it a long digit run costs O(n²). */
const LEADING_SEMVER = /(?<!\d)(\d+)\.(\d+)\.(\d+)/;

/** Extracts the leading `major.minor.patch` from a version or range string. */
export function parseLeadingSemver(raw: string): SemverTuple | null {
    const match = raw.match(LEADING_SEMVER);
    if (!match) {
        return null;
    }
    return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** Leading `major.minor.patch` of a range ("^1.2.3" -> "1.2.3"), or undefined. */
export function pinnedVersionOf(range: string): string | undefined {
    return parseLeadingSemver(range)?.join(".");
}

/** Compares two parsed semver tuples: negative if `a` < `b`, positive if `a` > `b`, 0 if equal. */
export function compareSemver(a: SemverTuple, b: SemverTuple): number {
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) {
            return a[i] - b[i];
        }
    }
    return 0;
}

/**
 * Best-effort check for whether a declared version or semver range (e.g.
 * "^3.5.34") is behind the latest published version. This is a lightweight
 * numeric comparison of the leading major.minor.patch in each string, not a
 * full semver-range satisfaction check, so it can be wrong for exotic
 * ranges (e.g. "workspace:*") — but is right for the common case of a
 * single pinned or caret/tilde-prefixed version.
 *
 * @returns true if outdated, false if not, or null if either version
 *          couldn't be parsed as a leading semver.
 */
export function isVersionOutdated(
    declared: string | null | undefined,
    latest: string | null | undefined,
): boolean | null {
    if (!declared || !latest) {
        return null;
    }
    const declaredSemver = parseLeadingSemver(declared);
    const latestSemver = parseLeadingSemver(latest);
    if (!declaredSemver || !latestSemver) {
        return null;
    }
    return compareSemver(declaredSemver, latestSemver) < 0;
}

/**
 * How many major versions a declared range trails the latest version.
 *
 * @returns 0 when level or ahead, or null when either side has no leading semver.
 */
export function majorVersionsBehind(range: string, latest: string | null): number | null {
    const declaredSemver = parseLeadingSemver(pinnedVersionOf(range) ?? "");
    const latestSemver = latest ? parseLeadingSemver(latest) : null;
    if (!declaredSemver || !latestSemver) {
        return null;
    }
    return Math.max(0, latestSemver[0] - declaredSemver[0]);
}
