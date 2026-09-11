import { hasLicenseWarning } from "./license";

export function fmtDate(dateStr) {
    if (!dateStr) return "-";
    try {
        return new Date(dateStr).toDateString().slice(4);
    } catch {
        return dateStr;
    }
}

export function fmtList(names) {
    if (!names || names.length === 0) return "-";
    return names.join(", ");
}

export function fmtOutdated(isOutdated) {
    if (isOutdated === null || isOutdated === undefined) return "-";
    return isOutdated ? "Yes" : "No";
}

export function fmtLicense(license) {
    const label = license ?? "-";
    return hasLicenseWarning(license) ? `${label} ⚠` : label;
}

export function fmtBundleSize(gzipBytes) {
    if (gzipBytes === null || gzipBytes === undefined) return "-";
    return `${(gzipBytes / 1024).toFixed(1)} KB`;
}

export function fmtNumber(n) {
    if (n === null || n === undefined) return "-";
    return n.toLocaleString("en-US");
}

// Per-column cell formatters, keyed by column key. Columns without an entry
// here fall back to a plain value ?? "-" passthrough (see formatCell).
// sourceCode isn't included: it renders a link instead of text, and is
// special-cased directly in DependenciesTable's template.
const CELL_FORMATTERS = {
    versionDate: (d) => fmtDate(d.versionDate),
    latestReleaseDate: (d) => fmtDate(d.latestReleaseDate),
    latestUpdateDate: (d) => fmtDate(d.latestUpdateDate),
    isOutdated: (d) => fmtOutdated(d.isOutdated),
    weeklyDownloads: (d) => fmtNumber(d.weeklyDownloads),
    gitStars: (d) => fmtNumber(d.gitStars),
    openPRs: (d) => fmtNumber(d.openPRs),
    closedPRs: (d) => fmtNumber(d.closedPRs),
    openIssues: (d) => fmtNumber(d.openIssues),
    closedIssues: (d) => fmtNumber(d.closedIssues),
    vulnerabilityCount: (d) => fmtNumber(d.vulnerabilityCount),
    dependencies: (d) => fmtList(d.dependencies),
    license: (d) => fmtLicense(d.license),
    bundleSizeGzip: (d) => fmtBundleSize(d.bundleSizeGzip),
    maintainers: (d) => fmtList(d.maintainers),
};

export function formatCell(key, dependency) {
    const formatter = CELL_FORMATTERS[key];
    return formatter ? formatter(dependency) : (dependency[key] ?? "-");
}

// Columns whose values are meaningful to sort by (excludes the source-code
// link, the raw semver ranges, and list-valued columns).
const SORT_ACCESSORS = {
    name: (d) => d.name,
    versionDate: (d) => d.versionDate,
    latestReleaseDate: (d) => d.latestReleaseDate,
    latestUpdateDate: (d) => d.latestUpdateDate,
    isOutdated: (d) => d.isOutdated,
    weeklyDownloads: (d) => d.weeklyDownloads,
    gitStars: (d) => d.gitStars,
    openPRs: (d) => d.openPRs,
    closedPRs: (d) => d.closedPRs,
    openIssues: (d) => d.openIssues,
    closedIssues: (d) => d.closedIssues,
    vulnerabilityCount: (d) => d.vulnerabilityCount,
    bundleSizeGzip: (d) => d.bundleSizeGzip,
};

/** Missing values always sort last, regardless of direction. */
export function compareValues(a, b, dir) {
    if (a == null && b == null) return 0;
    if (a == null) return 1;
    if (b == null) return -1;
    const cmp = typeof a === "string" ? a.localeCompare(b) : a < b ? -1 : a > b ? 1 : 0;
    return dir === "desc" ? -cmp : cmp;
}

/**
 * Sorts `dependencies` by the given column key/direction, using
 * SORT_ACCESSORS to pull each row's comparable value. Returns `dependencies`
 * unchanged (same reference) when `sortKey` is falsy - nothing to sort by.
 */
export function sortDependencies(dependencies, sortKey, sortDir) {
    if (!sortKey) return dependencies;
    const accessor = SORT_ACCESSORS[sortKey];
    return [...dependencies].sort((a, b) => compareValues(accessor(a), accessor(b), sortDir));
}
