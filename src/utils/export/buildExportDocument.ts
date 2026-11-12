import { FAILED_VALUE, MISSING_VALUE } from "../../constants";
import { t } from "../../i18n";
import type { DependencyRow, PackageInfo } from "../../types";
import { filterRowsByName, formatCell } from "../dependencyRowFormatting";
import { DEPENDENCY_TABLE_COLUMNS, NAME_COLUMN_KEY } from "../tableColumns";
import type { ColumnDef } from "../tableColumns";
import type { ExportDocument, ExportSection } from "./types";

export type ExportTableInput = {
    title: string;
    dependencies: DependencyRow[];
};

/** Suffix of every export file name: `<package slug>-dependencies.<ext>`. */
const FILE_NAME_SUFFIX = "dependencies";
const FILE_NAME_UNSAFE_RUNS = /[^a-z0-9-]+/g;
const FILE_NAME_EDGE_DASHES = /^-+|-+$/g;

const COLUMNS_BY_KEY = new Map(DEPENDENCY_TABLE_COLUMNS.map((c) => [c.key, c]));

function cellText(column: ColumnDef, row: PackageInfo): string {
    if (row.failedLookups?.[column.key]) {
        return FAILED_VALUE;
    }
    if (column.render === "link") {
        return row.sourceCode ?? MISSING_VALUE;
    }
    return String(formatCell(column.key, row));
}

function rowCells(columns: ColumnDef[], row: DependencyRow): string[] {
    if (!("error" in row)) {
        return [row.name, ...columns.map((column) => cellText(column, row))];
    }
    const cells = columns.map(() => "");
    if (cells.length > 0) {
        cells[0] = t("table.rowError", { error: row.error });
    }
    return [row.name, ...cells];
}

/**
 * Builds the export of what the tables show: Name, then the visible columns
 * in display order, rows filtered by `searchQuery`. Button columns carry no
 * data and are dropped; link columns export their URL.
 */
export function buildExportDocument(
    title: string,
    tables: ExportTableInput[],
    visibleColumnKeys: readonly string[],
    searchQuery: string,
): ExportDocument {
    const columns = visibleColumnKeys
        .map((key) => COLUMNS_BY_KEY.get(key))
        .filter(
            (c): c is ColumnDef =>
                c !== undefined && c.key !== NAME_COLUMN_KEY && c.render !== "button",
        );
    const headers = [t(`columns.${NAME_COLUMN_KEY}`), ...columns.map((c) => c.label)];
    const sections: ExportSection[] = tables.map((table) => ({
        title: table.title,
        headers,
        rows: filterRowsByName(table.dependencies, searchQuery).map((row) =>
            rowCells(columns, row),
        ),
    }));
    return { title, sectionHeader: t("export.sectionHeader"), sections };
}

/** File name without extension, e.g. "@vue/test-utils" -> "vue-test-utils-dependencies". */
export function exportFileBaseName(title: string): string {
    const slug = title
        .toLowerCase()
        .replace(FILE_NAME_UNSAFE_RUNS, "-")
        .replace(FILE_NAME_EDGE_DASHES, "");
    return slug ? `${slug}-${FILE_NAME_SUFFIX}` : FILE_NAME_SUFFIX;
}
