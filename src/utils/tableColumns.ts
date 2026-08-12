export type ColumnDef = {
  key: string;
  label: string;
  sortable: boolean;
}

export const DEPENDENCY_TABLE_COLUMNS: ColumnDef[] = [
  { key: "name", label: "Name", sortable: true },
  { key: "version", label: "Version", sortable: false },
  { key: "versionDate", label: "Version Date", sortable: true },
  { key: "latestVersion", label: "Latest version", sortable: false },
  { key: "latestReleaseDate", label: "Latest release date", sortable: true },
  { key: "latestUpdateDate", label: "Latest update date", sortable: true },
  { key: "isOutdated", label: "Outdated", sortable: true },
  { key: "weeklyDownloads", label: "Weekly downloads", sortable: true },
  { key: "sourceCode", label: "Source code", sortable: false },
  { key: "gitStars", label: "Git stars", sortable: true },
  { key: "openPRs", label: "Open PRs", sortable: true },
  { key: "closedPRs", label: "Closed PRs", sortable: true },
  { key: "openIssues", label: "Open issues", sortable: true },
  { key: "closedIssues", label: "Closed issues", sortable: true },
  { key: "dependencies", label: "Dependencies", sortable: false },
  { key: "license", label: "License", sortable: false },
  { key: "deprecated", label: "Deprecated", sortable: false },
  { key: "vulnerabilityCount", label: "Vulnerabilities", sortable: true },
  { key: "bundleSizeGzip", label: "Bundle size (gzip)", sortable: true },
  { key: "maintainers", label: "Maintainers", sortable: false },
];

/** The Name column is always visible; every other column can be hidden. */
export const TOGGLEABLE_COLUMNS = DEPENDENCY_TABLE_COLUMNS.filter((c) => c.key !== "name");

/** At least this many columns (Name included) must stay visible at all times. */
export const MIN_VISIBLE_COLUMNS = 2;

export function isColumnVisible(hiddenColumns: ReadonlySet<string>, key: string): boolean {
  return key === "name" || !hiddenColumns.has(key);
}

/**
 * True if `key` is currently visible and hiding it would drop the total
 * visible column count below MIN_VISIBLE_COLUMNS. Already-hidden columns
 * never violate the minimum (showing a column can only ever increase the
 * visible count).
 */
export function wouldViolateMinVisible(hiddenColumns: ReadonlySet<string>, key: string): boolean {
  if (hiddenColumns.has(key)) return false;
  const visibleCountAfterHiding = DEPENDENCY_TABLE_COLUMNS.length - hiddenColumns.size - 1;
  return visibleCountAfterHiding < MIN_VISIBLE_COLUMNS;
}

/**
 * Returns a new hidden-columns set with `key` toggled. The Name column can
 * never be hidden, and a toggle that would violate MIN_VISIBLE_COLUMNS is
 * ignored (the returned set is unchanged, same reference-inequality
 * contract as a normal toggle so callers can always just reassign).
 */
export function toggleColumnVisibility(hiddenColumns: ReadonlySet<string>, key: string): Set<string> {
  const next = new Set(hiddenColumns);
  if (key === "name") return next;
  if (next.has(key)) {
    next.delete(key);
  } else if (!wouldViolateMinVisible(hiddenColumns, key)) {
    next.add(key);
  }
  return next;
}
