import { BYTES_PER_KB, FILTER_RATIO_MIN_SAMPLE } from "../constants";
import type { DependencyListId, DependencyRow, PackageInfo } from "../types";
import { healthBand } from "./healthScore";
import { isCopyleftLicense, isCustomLicense } from "./license";
import { majorVersionsBehind } from "./semver";

export type PresetMatcher = (info: PackageInfo, now: Date) => boolean;

type HealthFilterSectionDefinition = {
    id: string;
    columnKeys: readonly string[];
    presets: readonly { id: string; matches: PresetMatcher }[];
};

type DateField = "versionDate" | "latestReleaseDate" | "latestUpdateDate" | "lastCommitDate";

type NumberField =
    | "weeklyDownloads"
    | "vulnerabilityCount"
    | "bundleSizeGzip"
    | "healthScore"
    | "commitsLastYear";

const MONTHS_PER_YEAR = 12;

/** Date `months` calendar months before `date` (UTC), clamped to the target month's last day. */
function subtractMonths(date: Date, months: number): Date {
    const result = new Date(date.getTime());
    const day = result.getUTCDate();
    result.setUTCDate(1);
    result.setUTCMonth(result.getUTCMonth() - months);
    const lastDay = new Date(
        Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
    ).getUTCDate();
    result.setUTCDate(Math.min(day, lastDay));
    return result;
}

function timeOf(value: string | null): number | null {
    const time = new Date(value ?? "").getTime();
    return Number.isNaN(time) ? null : time;
}

/** Field date is at or after `now` minus `months`. */
function within(field: DateField, months: number): PresetMatcher {
    return (info, now) => {
        const time = timeOf(info[field]);
        return time !== null && time >= subtractMonths(now, months).getTime();
    };
}

/** Field date is before `now` minus `months`. */
function over(field: DateField, months: number): PresetMatcher {
    return (info, now) => {
        const time = timeOf(info[field]);
        return time !== null && time < subtractMonths(now, months).getTime();
    };
}

function dateMissing(field: DateField): PresetMatcher {
    return (info) => timeOf(info[field]) === null;
}

/** Numeric field is present and passes `test`. */
function numberWhere(field: NumberField, test: (value: number) => boolean): PresetMatcher {
    return (info) => {
        const value = info[field];
        return value !== null && test(value);
    };
}

function numberMissing(field: NumberField): PresetMatcher {
    return (info) => info[field] === null;
}

/** Open share of open + closed, or null when a count is missing or the sample is too small. */
function openRatio(open: number | null, closed: number | null): number | null {
    if (open === null || closed === null || open + closed < FILTER_RATIO_MIN_SAMPLE) {
        return null;
    }
    return open / (open + closed);
}

function ratioWhere(
    openField: "openPRs" | "openIssues",
    closedField: "closedPRs" | "closedIssues",
    test: (ratio: number) => boolean,
): PresetMatcher {
    return (info) => {
        const ratio = openRatio(info[openField], info[closedField]);
        return ratio !== null && test(ratio);
    };
}

function ratioMissing(
    openField: "openPRs" | "openIssues",
    closedField: "closedPRs" | "closedIssues",
): PresetMatcher {
    return (info) => openRatio(info[openField], info[closedField]) === null;
}

function noCommitsFor(months: number): PresetMatcher {
    const stale = over("lastCommitDate", months);
    return (info, now) => info.commitsLastYear === 0 || stale(info, now);
}

function bytesWhere(test: (kilobytes: number) => boolean): PresetMatcher {
    return numberWhere("bundleSizeGzip", (bytes) => test(bytes / BYTES_PER_KB));
}

const dateAgePresets = (field: DateField) =>
    [
        { id: "within1Month", matches: within(field, 1) },
        { id: "within6Months", matches: within(field, 6) },
        { id: "over1Year", matches: over(field, MONTHS_PER_YEAR) },
        { id: "over2Years", matches: over(field, 2 * MONTHS_PER_YEAR) },
        { id: "over3Years", matches: over(field, 3 * MONTHS_PER_YEAR) },
        { id: "unknown", matches: dateMissing(field) },
    ] as const;

export const HEALTH_FILTER_SECTIONS = [
    {
        id: "lastPublished",
        columnKeys: ["latestReleaseDate"],
        presets: dateAgePresets("latestReleaseDate"),
    },
    {
        id: "lastUpdated",
        columnKeys: ["latestUpdateDate"],
        presets: [
            { id: "over1Year", matches: over("latestUpdateDate", MONTHS_PER_YEAR) },
            { id: "over2Years", matches: over("latestUpdateDate", 2 * MONTHS_PER_YEAR) },
            { id: "unknown", matches: dateMissing("latestUpdateDate") },
        ],
    },
    {
        id: "installedVersionAge",
        columnKeys: ["versionDate"],
        presets: dateAgePresets("versionDate"),
    },
    {
        id: "commitActivity",
        columnKeys: ["lastCommitDate"],
        presets: [
            { id: "commitsLastMonth", matches: within("lastCommitDate", 1) },
            { id: "noCommits3Months", matches: noCommitsFor(3) },
            { id: "noCommits6Months", matches: noCommitsFor(6) },
            { id: "noCommits1Year", matches: numberWhere("commitsLastYear", (n) => n === 0) },
            {
                id: "underOnePerMonth",
                matches: numberWhere("commitsLastYear", (n) => n < MONTHS_PER_YEAR),
            },
            { id: "unknown", matches: numberMissing("commitsLastYear") },
        ],
    },
    {
        id: "openPrRatio",
        columnKeys: ["openPRs", "closedPRs"],
        presets: [
            { id: "under10", matches: ratioWhere("openPRs", "closedPRs", (r) => r < 0.1) },
            { id: "over25", matches: ratioWhere("openPRs", "closedPRs", (r) => r > 0.25) },
            { id: "over50", matches: ratioWhere("openPRs", "closedPRs", (r) => r > 0.5) },
            { id: "over75", matches: ratioWhere("openPRs", "closedPRs", (r) => r > 0.75) },
            { id: "unknown", matches: ratioMissing("openPRs", "closedPRs") },
        ],
    },
    {
        id: "openIssueRatio",
        columnKeys: ["openIssues", "closedIssues"],
        presets: [
            { id: "under20", matches: ratioWhere("openIssues", "closedIssues", (r) => r < 0.2) },
            { id: "over40", matches: ratioWhere("openIssues", "closedIssues", (r) => r > 0.4) },
            { id: "over60", matches: ratioWhere("openIssues", "closedIssues", (r) => r > 0.6) },
            { id: "over80", matches: ratioWhere("openIssues", "closedIssues", (r) => r > 0.8) },
            { id: "unknown", matches: ratioMissing("openIssues", "closedIssues") },
        ],
    },
    {
        id: "vulnerabilities",
        columnKeys: ["vulnerabilityCount"],
        presets: [
            { id: "none", matches: numberWhere("vulnerabilityCount", (n) => n === 0) },
            { id: "any", matches: numberWhere("vulnerabilityCount", (n) => n >= 1) },
            { id: "atLeast3", matches: numberWhere("vulnerabilityCount", (n) => n >= 3) },
            { id: "atLeast10", matches: numberWhere("vulnerabilityCount", (n) => n >= 10) },
            { id: "unknown", matches: numberMissing("vulnerabilityCount") },
        ],
    },
    {
        id: "bundleSize",
        columnKeys: ["bundleSizeGzip"],
        presets: [
            { id: "under5Kb", matches: bytesWhere((kb) => kb < 5) },
            { id: "over25Kb", matches: bytesWhere((kb) => kb > 25) },
            { id: "over50Kb", matches: bytesWhere((kb) => kb > 50) },
            { id: "over100Kb", matches: bytesWhere((kb) => kb > 100) },
            { id: "over250Kb", matches: bytesWhere((kb) => kb > 250) },
            { id: "unknown", matches: numberMissing("bundleSizeGzip") },
        ],
    },
    {
        id: "healthScore",
        columnKeys: ["healthScore"],
        presets: [
            { id: "poor", matches: numberWhere("healthScore", (s) => healthBand(s) === "poor") },
            { id: "fair", matches: numberWhere("healthScore", (s) => healthBand(s) === "fair") },
            { id: "good", matches: numberWhere("healthScore", (s) => healthBand(s) === "good") },
            { id: "unknown", matches: numberMissing("healthScore") },
        ],
    },
    {
        id: "status",
        columnKeys: ["deprecated", "isOutdated", "latestVersion"],
        presets: [
            { id: "deprecated", matches: (info) => info.deprecated != null },
            { id: "outdated", matches: (info) => info.isOutdated === true },
            {
                id: "majorBehind",
                matches: (info) =>
                    (majorVersionsBehind(info.version, info.latestVersion) ?? 0) >= 1,
            },
        ],
    },
    {
        id: "maintainers",
        columnKeys: ["maintainers"],
        presets: [
            { id: "single", matches: (info) => info.maintainers?.length === 1 },
            { id: "none", matches: (info) => !info.maintainers?.length },
        ],
    },
    {
        id: "adoption",
        columnKeys: ["weeklyDownloads"],
        presets: [
            { id: "under1k", matches: numberWhere("weeklyDownloads", (n) => n < 1_000) },
            { id: "under10k", matches: numberWhere("weeklyDownloads", (n) => n < 10_000) },
            { id: "unknown", matches: numberMissing("weeklyDownloads") },
        ],
    },
    {
        id: "license",
        columnKeys: ["license"],
        presets: [
            { id: "missing", matches: (info) => !info.license },
            { id: "copyleft", matches: (info) => isCopyleftLicense(info.license) },
            { id: "custom", matches: (info) => isCustomLicense(info.license) },
        ],
    },
    {
        id: "source",
        columnKeys: ["sourceCode"],
        presets: [{ id: "noRepository", matches: (info) => info.sourceCode == null }],
    },
] as const satisfies readonly HealthFilterSectionDefinition[];

export type HealthFilterSection = (typeof HEALTH_FILTER_SECTIONS)[number];

export type FilterSectionId = HealthFilterSection["id"];

/** Chosen preset id per section; a missing section has no filter. */
export type HealthFilters = { [S in HealthFilterSection as S["id"]]?: S["presets"][number]["id"] };

type ActiveFilter = { section: HealthFilterSectionDefinition; matches: PresetMatcher };

const SECTION_ID_BUNDLE_SIZE: FilterSectionId = "bundleSize";

/** Bundle size is not measured for dev dependencies, so its section skips them. */
export function isHealthFilterSectionApplicable(
    sectionId: FilterSectionId,
    listId?: DependencyListId,
): boolean {
    return !(listId === "devDeps" && sectionId === SECTION_ID_BUNDLE_SIZE);
}

/** Sections with a known preset id that apply to `listId`. */
function activeFilters(filters: HealthFilters, listId?: DependencyListId): ActiveFilter[] {
    const presetIds: Partial<Record<string, string>> = filters;
    const active: ActiveFilter[] = [];
    for (const section of HEALTH_FILTER_SECTIONS) {
        if (!isHealthFilterSectionApplicable(section.id, listId)) {
            continue;
        }
        const preset = section.presets.find((candidate) => candidate.id === presetIds[section.id]);
        if (preset) {
            active.push({ section, matches: preset.matches });
        }
    }
    return active;
}

/** True when no filter is active, else when the row is fetched data matching every active section. */
export function rowMatchesHealthFilters(
    row: DependencyRow,
    filters: HealthFilters,
    now: Date,
    listId: DependencyListId,
): boolean {
    const active = activeFilters(filters, listId);
    if (active.length === 0) {
        return true;
    }
    if ("error" in row) {
        return false;
    }
    return active.every(({ matches }) => matches(row, now));
}

/** Rows matching the filters; no active filter keeps every row (same reference). */
export function filterRowsByHealth<Row extends DependencyRow>(
    rows: Row[],
    filters: HealthFilters,
    now: Date,
    listId: DependencyListId,
): Row[] {
    if (activeFilters(filters, listId).length === 0) {
        return rows;
    }
    return rows.filter((row) => rowMatchesHealthFilters(row, filters, now, listId));
}

/** Column keys the active sections read. */
export function columnsForHealthFilters(filters: HealthFilters): string[] {
    return [...new Set(activeFilters(filters).flatMap(({ section }) => section.columnKeys))];
}

export function activeHealthFilterCount(filters: HealthFilters): number {
    return activeFilters(filters).length;
}

/**
 * Filters minus active sections reading a column `isExcluded` flags (rows
 * lack that column's data). Nothing dropped keeps the same reference.
 */
export function healthFiltersWithoutColumns(
    filters: HealthFilters,
    isExcluded: (columnKey: string) => boolean,
): HealthFilters {
    const dropped = activeFilters(filters).filter(({ section }) =>
        section.columnKeys.some(isExcluded),
    );
    if (dropped.length === 0) {
        return filters;
    }
    const kept: Partial<Record<string, string>> = { ...filters };
    for (const { section } of dropped) {
        delete kept[section.id];
    }
    return kept as HealthFilters;
}
