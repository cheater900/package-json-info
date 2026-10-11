import { hasLicenseWarning } from "./license";
import { BYTES_PER_KB, MISSING_VALUE, NUMBER_LOCALE } from "../constants";
import { t } from "../i18n";

const LICENSE_WARNING_MARK = "⚠";
/** Drops the weekday from `Date#toDateString` ("Mon Jan 01 2024" -> "Jan 01 2024"). */
const WEEKDAY_PREFIX_LENGTH = 4;

export function fmtDate(dateStr) {
    const date = new Date(dateStr);
    if (!dateStr || Number.isNaN(date.getTime())) {
        return MISSING_VALUE;
    }
    return date.toDateString().slice(WEEKDAY_PREFIX_LENGTH);
}

export function fmtList(names) {
    if (!names || names.length === 0) {
        return MISSING_VALUE;
    }
    return names.join(", ");
}

export function fmtOutdated(isOutdated) {
    if (isOutdated == null) {
        return MISSING_VALUE;
    }
    return isOutdated ? t("cell.yes") : t("cell.no");
}

export function fmtLicense(license) {
    const label = license ?? MISSING_VALUE;
    return hasLicenseWarning(license) ? `${label} ${LICENSE_WARNING_MARK}` : label;
}

export function fmtBundleSize(gzipBytes) {
    if (gzipBytes == null) {
        return MISSING_VALUE;
    }
    return t("cell.kilobytes", { size: (gzipBytes / BYTES_PER_KB).toFixed(1) });
}

export function fmtNumber(n) {
    if (n == null) {
        return MISSING_VALUE;
    }
    return n.toLocaleString(NUMBER_LOCALE);
}

// Columns without an entry fall back to `value ?? MISSING_VALUE`. Link and
// button columns render markup instead (see DependencyCell).
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
    return formatter ? formatter(dependency) : (dependency[key] ?? MISSING_VALUE);
}

/** Missing values always sort last, regardless of direction. */
export function compareValues(a, b, dir) {
    if (a == null && b == null) {
        return 0;
    }
    if (a == null) {
        return 1;
    }
    if (b == null) {
        return -1;
    }
    const cmp = typeof a === "string" ? a.localeCompare(b) : a < b ? -1 : a > b ? 1 : 0;
    return dir === "desc" ? -cmp : cmp;
}

/**
 * Sorts `dependencies` by the raw value under `sortKey` (a `sortable`
 * column). Returns `dependencies` unchanged (same reference) when
 * `sortKey` is falsy.
 */
export function sortDependencies(dependencies, sortKey, sortDir) {
    if (!sortKey) {
        return dependencies;
    }
    return [...dependencies].sort((a, b) => compareValues(a[sortKey], b[sortKey], sortDir));
}
