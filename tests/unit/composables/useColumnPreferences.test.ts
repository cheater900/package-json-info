import { describe, it, expect, beforeEach } from "vitest";
import { nextTick } from "vue";
import { useColumnPreferences } from "../../../src/composables/useColumnPreferences";
import { TOGGLEABLE_COLUMNS, DEFAULT_VISIBLE_COLUMNS } from "../../../src/utils/tableColumns";
import {
    STORAGE_KEY_VISIBLE_COLUMNS,
    STORAGE_KEY_COLUMN_ORDER,
    STORAGE_KEY_SHRINK_LABELS,
} from "../../../src/constants";

beforeEach(() => {
    localStorage.clear();
});

describe("initial state", () => {
    it("loads visibleColumns, columnOrder, shrinkColumnLabels from localStorage defaults", () => {
        const { visibleColumns, columnOrder, shrinkColumnLabels } = useColumnPreferences();

        expect(visibleColumns.value).toEqual(new Set(DEFAULT_VISIBLE_COLUMNS));
        expect(columnOrder.value).toEqual(TOGGLEABLE_COLUMNS.map((c) => c.key));
        expect(shrinkColumnLabels.value).toBe(false);
    });
});

describe("toggleColumn", () => {
    it("shows hidden column", () => {
        const { visibleColumns, toggleColumn } = useColumnPreferences();

        toggleColumn("maintainers");

        expect(visibleColumns.value.has("maintainers")).toBe(true);
    });

    it("persists change to localStorage on toggle", async () => {
        const { toggleColumn } = useColumnPreferences();

        toggleColumn("maintainers");
        await nextTick();

        expect(JSON.parse(localStorage.getItem(STORAGE_KEY_VISIBLE_COLUMNS)!)).toContain(
            "maintainers",
        );
    });
});

describe("reorderColumns", () => {
    it("reorders visible columns, keeps hidden columns in own slots", () => {
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

    it("persists new order to localStorage", async () => {
        const { columnOrder, reorderColumns } = useColumnPreferences();
        const visibleOrder = columnOrder.value.filter((key) => DEFAULT_VISIBLE_COLUMNS.has(key));
        const reversedVisible = [...visibleOrder].reverse();

        reorderColumns(reversedVisible);
        await nextTick();

        const stored = JSON.parse(localStorage.getItem(STORAGE_KEY_COLUMN_ORDER)!);
        expect(stored.filter((key) => DEFAULT_VISIBLE_COLUMNS.has(key))).toEqual(reversedVisible);
    });
});

describe("visibleColumnKeys", () => {
    it("returns visible toggleable columns only, in columnOrder", () => {
        const { visibleColumnKeys } = useColumnPreferences();

        expect(visibleColumnKeys.value).toEqual(
            TOGGLEABLE_COLUMNS.map((c) => c.key).filter((key) => DEFAULT_VISIBLE_COLUMNS.has(key)),
        );
    });

    it("updates on hidden column toggled visible", () => {
        const { visibleColumnKeys, toggleColumn } = useColumnPreferences();
        expect(visibleColumnKeys.value).not.toContain("maintainers");

        toggleColumn("maintainers");

        expect(visibleColumnKeys.value).toContain("maintainers");
    });
});

describe("shrinkColumnLabels", () => {
    it("persists change to localStorage", async () => {
        const { shrinkColumnLabels } = useColumnPreferences();

        shrinkColumnLabels.value = true;
        await nextTick();

        expect(JSON.parse(localStorage.getItem(STORAGE_KEY_SHRINK_LABELS)!)).toBe(true);
    });
});
