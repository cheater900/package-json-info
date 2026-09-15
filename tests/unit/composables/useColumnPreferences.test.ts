import { describe, it, expect, beforeEach } from "vitest";
import { nextTick } from "vue";
import { useColumnPreferences } from "../../../src/composables/useColumnPreferences";
import { TOGGLEABLE_COLUMNS, DEFAULT_VISIBLE_COLUMNS } from "../../../src/utils/tableColumns";

const STORAGE_KEY = "package-json-info:visibleColumns";
const ORDER_STORAGE_KEY = "package-json-info:columnOrder";
const SHRINK_LABELS_STORAGE_KEY = "package-json-info:shrinkColumnLabels";

beforeEach(() => {
    localStorage.clear();
});

describe("initial state", () => {
    it("loads visibleColumns, columnOrder, and shrinkColumnLabels from localStorage defaults", () => {
        const { visibleColumns, columnOrder, shrinkColumnLabels } = useColumnPreferences();

        expect(visibleColumns.value).toEqual(new Set(DEFAULT_VISIBLE_COLUMNS));
        expect(columnOrder.value).toEqual(TOGGLEABLE_COLUMNS.map((c) => c.key));
        expect(shrinkColumnLabels.value).toBe(false);
    });
});

describe("toggleColumn", () => {
    it("shows a currently-hidden column", () => {
        const { visibleColumns, toggleColumn } = useColumnPreferences();

        toggleColumn("maintainers");

        expect(visibleColumns.value.has("maintainers")).toBe(true);
    });

    it("persists the change to localStorage", async () => {
        const { toggleColumn } = useColumnPreferences();

        toggleColumn("maintainers");
        await nextTick();

        expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toContain("maintainers");
    });
});

describe("reorderColumns", () => {
    it("reorders the currently-visible columns, keeping each hidden column in its own slot", () => {
        const { columnOrder, reorderColumns } = useColumnPreferences();
        const visibleOrder = columnOrder.value.filter((key) => DEFAULT_VISIBLE_COLUMNS.has(key));
        const reversedVisible = [...visibleOrder].reverse();

        reorderColumns(reversedVisible);

        expect(columnOrder.value.filter((key) => DEFAULT_VISIBLE_COLUMNS.has(key))).toEqual(
            reversedVisible,
        );
        expect(columnOrder.value.filter((key) => !DEFAULT_VISIBLE_COLUMNS.has(key))).toEqual(
            TOGGLEABLE_COLUMNS.map((c) => c.key).filter((key) => !DEFAULT_VISIBLE_COLUMNS.has(key)),
        );
    });

    it("persists the change to localStorage", async () => {
        const { columnOrder, reorderColumns } = useColumnPreferences();
        const visibleOrder = columnOrder.value.filter((key) => DEFAULT_VISIBLE_COLUMNS.has(key));
        const reversedVisible = [...visibleOrder].reverse();

        reorderColumns(reversedVisible);
        await nextTick();

        const stored = JSON.parse(localStorage.getItem(ORDER_STORAGE_KEY)!);
        expect(stored.filter((key) => DEFAULT_VISIBLE_COLUMNS.has(key))).toEqual(reversedVisible);
    });
});

describe("visibleColumnKeys", () => {
    it("returns only the visible toggleable columns, in columnOrder", () => {
        const { visibleColumnKeys } = useColumnPreferences();

        expect(visibleColumnKeys.value).toEqual(
            TOGGLEABLE_COLUMNS.map((c) => c.key).filter((key) => DEFAULT_VISIBLE_COLUMNS.has(key)),
        );
    });

    it("updates when a hidden column is toggled visible", () => {
        const { visibleColumnKeys, toggleColumn } = useColumnPreferences();
        expect(visibleColumnKeys.value).not.toContain("maintainers");

        toggleColumn("maintainers");

        expect(visibleColumnKeys.value).toContain("maintainers");
    });
});

describe("shrinkColumnLabels", () => {
    it("persists a change to localStorage", async () => {
        const { shrinkColumnLabels } = useColumnPreferences();

        shrinkColumnLabels.value = true;
        await nextTick();

        expect(JSON.parse(localStorage.getItem(SHRINK_LABELS_STORAGE_KEY)!)).toBe(true);
    });
});
