type SemverTuple = [number, number, number];

function parseLeadingSemver(raw: string): SemverTuple | null {
    const match = raw.match(/(\d+)\.(\d+)\.(\d+)/);
    if (!match) return null;
    return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareSemver(a: SemverTuple, b: SemverTuple): number {
    for (let i = 0; i < 3; i++) {
        if (a[i] !== b[i]) return a[i] - b[i];
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
    if (!declared || !latest) return null;
    const declaredSemver = parseLeadingSemver(declared);
    const latestSemver = parseLeadingSemver(latest);
    if (!declaredSemver || !latestSemver) return null;
    return compareSemver(declaredSemver, latestSemver) < 0;
}
