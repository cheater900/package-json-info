import { formatKilobytes } from "./bytes";
import { healthBand } from "./healthScore";
import { hasLicenseWarning } from "./license";
import { MISSING_VALUE, NUMBER_LOCALE } from "../constants";
import { t } from "../i18n";
import type { PackageInfo, SortDirection } from "../types";

type CellValue = PackageInfo[keyof PackageInfo] | null | undefined;

/** Row as cells read it: any field may be missing or null. */
type CellSource = { [K in keyof PackageInfo]?: PackageInfo[K] | null };

type CellFormatter = (dependency: CellSource) => string;

const LICENSE_WARNING_MARK = "⚠";
/** Drops the weekday from `Date#toDateString` ("Mon Jan 01 2024" -> "Jan 01 2024"). */
const WEEKDAY_PREFIX_LENGTH = 4;

export function fmtDate(dateStr: string | null | undefined): string {
    const date = new Date(dateStr ?? "");
    if (!dateStr || Number.isNaN(date.getTime())) {
        return MISSING_VALUE;
    }
    return date.toDateString().slice(WEEKDAY_PREFIX_LENGTH);
}

/** Note shown on a row built from stored values; empty when the row is live. */
export function fmtStaleNote(staleSince: string | null | undefined): string {
    return staleSince ? t("table.staleNote", { date: fmtDate(staleSince) }) : "";
}

export function fmtList(names: readonly string[] | null | undefined): string {
    if (!names || names.length === 0) {
        return MISSING_VALUE;
    }
    return names.join(", ");
}

export function fmtOutdated(isOutdated: boolean | null | undefined): string {
    if (isOutdated == null) {
        return MISSING_VALUE;
    }
    return isOutdated ? t("cell.yes") : t("cell.no");
}

/** Score plus its band label, e.g. "82 good". */
export function fmtHealth(score: number | null | undefined): string {
    if (score == null) {
        return MISSING_VALUE;
    }
    return `${score} ${t(`health.bands.${healthBand(score)}`)}`;
}

export function fmtLicense(license: string | null | undefined): string {
    const label = license ?? MISSING_VALUE;
    return hasLicenseWarning(license) ? `${label} ${LICENSE_WARNING_MARK}` : label;
}

export function fmtBundleSize(gzipBytes: number | null | undefined): string {
    if (gzipBytes == null) {
        return MISSING_VALUE;
    }
    return formatKilobytes(gzipBytes);
}

export function fmtNumber(n: number | null | undefined): string {
    if (n == null) {
        return MISSING_VALUE;
    }
    return n.toLocaleString(NUMBER_LOCALE);
}

// Columns without an entry fall back to `value ?? MISSING_VALUE`. Link and
// button columns render markup instead (see DependencyCell).
const CELL_FORMATTERS: Partial<Record<string, CellFormatter>> = {
    versionDate: (d) => fmtDate(d.versionDate),
    latestReleaseDate: (d) => fmtDate(d.latestReleaseDate),
    latestUpdateDate: (d) => fmtDate(d.latestUpdateDate),
    isOutdated: (d) => fmtOutdated(d.isOutdated),
    healthScore: (d) => fmtHealth(d.healthScore),
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

export function formatCell(key: string, dependency: CellSource) {
    const formatter = CELL_FORMATTERS[key];
    return formatter
        ? formatter(dependency)
        : (dependency[key as keyof PackageInfo] ?? MISSING_VALUE);
}

/** Rows whose name contains `query`, case-insensitive; blank query keeps every row (same reference). */
export function filterRowsByName<Row extends { name?: string }>(rows: Row[], query: string): Row[] {
    const needle = query.trim().toLowerCase();
    if (!needle) {
        return rows;
    }
    return rows.filter((row) => row.name?.toLowerCase().includes(needle));
}

function cellValue(row: object, key: string): CellValue {
    return (row as CellSource)[key as keyof PackageInfo];
}

/** Missing values always sort last, regardless of direction. */
export function compareValues(a: CellValue, b: CellValue, dir: SortDirection): number {
    if (a == null && b == null) {
        return 0;
    }
    if (a == null) {
        return 1;
    }
    if (b == null) {
        return -1;
    }
    const cmp = typeof a === "string" ? a.localeCompare(String(b)) : a < b ? -1 : a > b ? 1 : 0;
    return dir === "desc" ? -cmp : cmp;
}

/**
 * Sorts `dependencies` by the raw value under `sortKey` (a `sortable`
 * column). Returns `dependencies` unchanged (same reference) when
 * `sortKey` is falsy.
 */
export function sortDependencies<Row extends object>(
    dependencies: Row[],
    sortKey: string | null,
    sortDir: SortDirection,
): Row[] {
    if (!sortKey) {
        return dependencies;
    }
    return [...dependencies].sort((a, b) =>
        compareValues(cellValue(a, sortKey), cellValue(b, sortKey), sortDir),
    );
}
