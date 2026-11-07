import {
    BUNDLEPHOBIA_SIZE_URL,
    CODEBERG_API_URL,
    COMMIT_ACTIVITY_SAMPLE_SIZE,
    COMMIT_ACTIVITY_WINDOW_DAYS,
    FAILED_VALUE,
    FILTER_RATIO_MIN_SAMPLE,
    GITHUB_API_URL,
    GITLAB_API_URL,
    HEALTH_BAND_FAIR_MIN,
    HEALTH_BAND_GOOD_MIN,
    HEALTH_ISSUE_RATIO_WORST,
    HEALTH_MAINTAINERS_BEST,
    HEALTH_SCORE_MAX,
    HEALTH_STALE_FRESH_MONTHS,
    HEALTH_STALE_WORST_MONTHS,
    HEALTH_WEIGHT_DEPRECATED,
    HEALTH_WEIGHT_ISSUES,
    HEALTH_WEIGHT_MAINTAINERS,
    HEALTH_WEIGHT_OUTDATED,
    HEALTH_WEIGHT_RELEASE_AGE,
    HEALTH_WEIGHT_VULNERABILITIES,
    MISSING_VALUE,
    NPM_REGISTRY_URL,
    NPM_WEEKLY_DOWNLOADS_URL,
    OSV_QUERY_URL,
} from "../constants";
import { exportFileBaseName } from "../export/buildExportDocument";
import { hasMessage, t } from "../i18n";
import type { DependencyListId, DependencyRow, PackageError, PackageInfo } from "../types";
import { filterRowsByName, formatCell } from "../utils/dependencyRowFormatting";
import {
    HEALTH_FILTER_SECTIONS,
    filterRowsByHealth,
    isHealthFilterSectionApplicable,
} from "../utils/healthFilters";
import type {
    FilterSectionId,
    HealthFilterSection,
    HealthFilters,
    PresetMatcher,
} from "../utils/healthFilters";
import { formatPercent } from "../utils/percent";
import type { Report, ReportBlock } from "./types";

export type ReportTableInput = {
    id: DependencyListId;
    title: string;
    dependencies: DependencyRow[];
};

export type ReportInput = {
    /** Package name of the loaded package.json. */
    title: string;
    tables: ReportTableInput[];
    /** Name search applied to every table, as the tables apply it. */
    searchQuery: string;
    healthFilters: HealthFilters;
};

/** Table rows after search + filters, split into fetched rows and fetch errors. */
type ReportTable = {
    id: DependencyListId;
    title: string;
    rowCount: number;
    fetched: PackageInfo[];
    errors: PackageError[];
};

/** Columns every report section reads, so the caller fetches them before building. */
export const REPORT_COLUMN_KEYS: readonly string[] = [
    ...new Set(HEALTH_FILTER_SECTIONS.flatMap((section) => section.columnKeys)),
];

/** Row fields listed per package, when a section reads more than its `columnKeys`. */
const REPORT_VALUE_KEYS: Partial<Record<FilterSectionId, readonly string[]>> = {
    commitActivity: ["lastCommitDate", "commitsLastYear"],
};

/** Listed fields filled by another column's lookup, so they fail with that column. */
const REPORT_VALUE_LOOKUP_KEYS: Partial<Record<string, string>> = {
    commitsLastYear: "lastCommitDate",
};

/** Date fields the report prints as UTC `YYYY-MM-DD`, the same in every time zone. */
const REPORT_DATE_KEYS = new Set([
    "versionDate",
    "latestReleaseDate",
    "latestUpdateDate",
    "lastCommitDate",
]);
const ISO_DATE_LENGTH = 10;

const REPORT_FILE_NAME_SUFFIX = "report";

/** Values the section definitions quote, so the text always matches the code. */
const DEFINITION_PARAMS = {
    ratioMinSample: FILTER_RATIO_MIN_SAMPLE,
    commitWindowDays: COMMIT_ACTIVITY_WINDOW_DAYS,
    commitSampleSize: COMMIT_ACTIVITY_SAMPLE_SIZE,
    scoreMax: HEALTH_SCORE_MAX,
    weightReleaseAge: HEALTH_WEIGHT_RELEASE_AGE,
    weightDeprecated: HEALTH_WEIGHT_DEPRECATED,
    weightOutdated: HEALTH_WEIGHT_OUTDATED,
    weightMaintainers: HEALTH_WEIGHT_MAINTAINERS,
    weightIssues: HEALTH_WEIGHT_ISSUES,
    weightVulnerabilities: HEALTH_WEIGHT_VULNERABILITIES,
    staleFreshMonths: HEALTH_STALE_FRESH_MONTHS,
    staleWorstMonths: HEALTH_STALE_WORST_MONTHS,
    maintainersBest: HEALTH_MAINTAINERS_BEST,
    issueRatioWorst: formatPercent(HEALTH_ISSUE_RATIO_WORST),
    poorMax: HEALTH_BAND_FAIR_MIN - 1,
    fairMin: HEALTH_BAND_FAIR_MIN,
    fairMax: HEALTH_BAND_GOOD_MIN - 1,
    goodMin: HEALTH_BAND_GOOD_MIN,
};

const DATA_SOURCES = [
    { id: "npmRegistry", url: NPM_REGISTRY_URL },
    { id: "npmDownloads", url: NPM_WEEKLY_DOWNLOADS_URL },
    { id: "osv", url: OSV_QUERY_URL },
    { id: "bundlephobia", url: BUNDLEPHOBIA_SIZE_URL },
    { id: "github", url: GITHUB_API_URL },
    { id: "gitlab", url: GITLAB_API_URL },
    { id: "codeberg", url: CODEBERG_API_URL },
];

function heading(level: 1 | 2 | 3, text: string): ReportBlock {
    return { kind: "heading", level, text };
}

function paragraph(text: string): ReportBlock {
    return { kind: "paragraph", text };
}

function list(items: string[]): ReportBlock {
    return { kind: "list", items };
}

function fieldLabel(key: string): string {
    return hasMessage(`columns.${key}`) ? t(`columns.${key}`) : t(`report.fields.${key}`);
}

function isoDate(value: unknown): string {
    const time = new Date(typeof value === "string" ? value : "").getTime();
    return Number.isNaN(time)
        ? MISSING_VALUE
        : new Date(time).toISOString().slice(0, ISO_DATE_LENGTH);
}

/**
 * Raw value text: UTC dates, bare health score (presets name the band), no
 * warning mark on licenses, deprecation notice quoted verbatim.
 */
function valueText(key: string, row: PackageInfo): string {
    if (row.failedLookups?.[REPORT_VALUE_LOOKUP_KEYS[key] ?? key]) {
        return FAILED_VALUE;
    }
    if (REPORT_DATE_KEYS.has(key)) {
        return isoDate(row[key as keyof PackageInfo]);
    }
    if (key === "healthScore") {
        return row.healthScore === null ? MISSING_VALUE : String(row.healthScore);
    }
    if (key === "license") {
        return row.license ?? MISSING_VALUE;
    }
    if (key === "deprecated") {
        return row.deprecated ? t("report.quoted", { text: row.deprecated }) : MISSING_VALUE;
    }
    return String(formatCell(key, row));
}

function packageItem(section: HealthFilterSection, row: PackageInfo): string {
    const keys = REPORT_VALUE_KEYS[section.id] ?? section.columnKeys;
    const values = keys.map((key) => `${fieldLabel(key)}: ${valueText(key, row)}`).join("; ");
    return `${row.name} ${row.version} (${values})`;
}

function countCell(count: number, total: number): string {
    return total === 0 ? String(count) : `${count} (${formatPercent(count / total)})`;
}

function toReportTable(table: ReportTableInput, input: ReportInput, now: Date): ReportTable {
    const named = filterRowsByName(table.dependencies, input.searchQuery);
    const rows = filterRowsByHealth(named, input.healthFilters, now, table.id);
    return {
        id: table.id,
        title: table.title,
        rowCount: rows.length,
        fetched: rows.filter((row): row is PackageInfo => !("error" in row)),
        errors: rows.filter((row): row is PackageError => "error" in row),
    };
}

function activeFilterLabels(filters: HealthFilters): string[] {
    const presetIds: Partial<Record<string, string>> = filters;
    return HEALTH_FILTER_SECTIONS.filter((section) => presetIds[section.id]).map(
        (section) =>
            `${t(`filters.sections.${section.id}`)}: ${t(`filters.presets.${section.id}.${presetIds[section.id]}`)}`,
    );
}

function overviewBlocks(input: ReportInput, tables: ReportTable[], now: Date): ReportBlock[] {
    const query = input.searchQuery.trim();
    const filters = activeFilterLabels(input.healthFilters);
    return [
        heading(2, t("report.overview.title")),
        list([
            t("report.overview.generated", { date: now.toISOString() }),
            ...tables.map((table) =>
                t("report.overview.rowCount", { table: table.title, count: table.rowCount }),
            ),
            t("report.overview.search", {
                query: query ? t("report.quoted", { text: query }) : t("report.none"),
            }),
            t("report.overview.filters", {
                filters: filters.length > 0 ? filters.join(", ") : t("report.none"),
            }),
        ]),
        paragraph(t("report.overview.scope")),
    ];
}

function errorItems(tables: ReportTable[]): string[] {
    return tables.flatMap((table) =>
        table.errors.map((row) =>
            t("report.coverage.errorItem", {
                table: table.title,
                name: row.name,
                version: row.version,
                error: row.error,
            }),
        ),
    );
}

function failedLookupRows(tables: ReportTable[]): string[][] {
    const keys = [
        ...new Set(
            tables.flatMap((table) =>
                table.fetched.flatMap((row) => Object.keys(row.failedLookups ?? {})),
            ),
        ),
    ];
    return keys.map((key) => [
        fieldLabel(key),
        ...tables.map((table) =>
            String(table.fetched.filter((row) => row.failedLookups?.[key]).length),
        ),
    ]);
}

function coverageBlocks(tables: ReportTable[]): ReportBlock[] {
    const blocks: ReportBlock[] = [
        heading(2, t("report.coverage.title")),
        {
            kind: "table",
            headers: [
                t("report.coverage.table"),
                t("report.coverage.rows"),
                t("report.coverage.fetched"),
                t("report.coverage.errors"),
                t("report.coverage.stale"),
            ],
            rows: tables.map((table) => [
                table.title,
                String(table.rowCount),
                String(table.fetched.length),
                String(table.errors.length),
                String(table.fetched.filter((row) => row.staleSince).length),
            ]),
        },
        paragraph(t("report.coverage.staleNote")),
    ];
    const errors = errorItems(tables);
    if (errors.length > 0) {
        blocks.push(heading(3, t("report.coverage.errorsTitle")), list(errors));
    }
    const failed = failedLookupRows(tables);
    if (failed.length > 0) {
        blocks.push(heading(3, t("report.coverage.failedTitle")), {
            kind: "table",
            headers: [t("report.coverage.field"), ...tables.map((table) => table.title)],
            rows: failed,
        });
    }
    return blocks;
}

function sourceBlocks(): ReportBlock[] {
    return [
        heading(2, t("report.sources.title")),
        list(
            DATA_SOURCES.map(({ id, url }) =>
                t("report.sources.item", {
                    name: t(`report.sources.names.${id}`),
                    url,
                    fields: t(`report.sources.fields.${id}`),
                }),
            ),
        ),
        paragraph(t("report.sources.computed")),
    ];
}

/** Rows of each table matching `matches`; null where the section does not apply to the table. */
function matchesPerTable(
    section: HealthFilterSection,
    matches: PresetMatcher,
    tables: ReportTable[],
    now: Date,
): (PackageInfo[] | null)[] {
    return tables.map((table) =>
        isHealthFilterSectionApplicable(section.id, table.id)
            ? table.fetched.filter((row) => matches(row, now))
            : null,
    );
}

function sectionBlocks(
    section: HealthFilterSection,
    tables: ReportTable[],
    now: Date,
): ReportBlock[] {
    const presets = section.presets.map((preset) => ({
        label: t(`filters.presets.${section.id}.${preset.id}`),
        matched: matchesPerTable(section, preset.matches, tables, now),
    }));
    const blocks: ReportBlock[] = [
        heading(2, t(`filters.sections.${section.id}`)),
        paragraph(t(`report.definitions.${section.id}`, DEFINITION_PARAMS)),
        {
            kind: "table",
            headers: [t("report.preset"), ...tables.map((table) => table.title)],
            rows: presets.map(({ label, matched }) => [
                label,
                ...matched.map((rows, i) =>
                    rows === null
                        ? MISSING_VALUE
                        : countCell(rows.length, tables[i].fetched.length),
                ),
            ]),
        },
    ];
    for (const { label, matched } of presets) {
        if (matched.every((rows) => !rows?.length)) {
            continue;
        }
        blocks.push(heading(3, label));
        matched.forEach((rows, i) => {
            if (!rows?.length) {
                return;
            }
            blocks.push(
                paragraph(t("report.packagesIn", { table: tables[i].title })),
                list(rows.map((row) => packageItem(section, row))),
            );
        });
    }
    return blocks;
}

/**
 * Fact sheet of the rows the tables show (search + health filters applied):
 * overview, data coverage, data sources, then one section per health filter
 * section with preset counts and matching packages. `input.tables` rows
 * must hold every `REPORT_COLUMN_KEYS` column.
 */
export function buildReport(input: ReportInput, now: Date): Report {
    const title = t("report.title", { name: input.title });
    const tables = input.tables.map((table) => toReportTable(table, input, now));
    return {
        title,
        blocks: [
            heading(1, title),
            ...overviewBlocks(input, tables, now),
            ...coverageBlocks(tables),
            ...sourceBlocks(),
            ...HEALTH_FILTER_SECTIONS.flatMap((section) => sectionBlocks(section, tables, now)),
        ],
    };
}

/** Report file name without extension, e.g. "@vue/test-utils" -> "vue-test-utils-report". */
export function reportFileBaseName(title: string): string {
    return exportFileBaseName(title, REPORT_FILE_NAME_SUFFIX);
}
