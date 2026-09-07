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
    it("sets columnOrder to the given order", () => {
        const { columnOrder, reorderColumns } = useColumnPreferences();
        const reversed = TOGGLEABLE_COLUMNS.map((c) => c.key).reverse();

        reorderColumns(reversed);

        expect(columnOrder.value).toEqual(reversed);
    });

    it("persists the change to localStorage", async () => {
        const { reorderColumns } = useColumnPreferences();
        const reversed = TOGGLEABLE_COLUMNS.map((c) => c.key).reverse();

        reorderColumns(reversed);
        await nextTick();

        expect(JSON.parse(localStorage.getItem(ORDER_STORAGE_KEY)!)).toEqual(reversed);
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

describe("columnLabels / columnTitles", () => {
    it("uses each column's own full label when shrinkColumnLabels is false", () => {
        const { columnLabels, columnTitles } = useColumnPreferences();

        expect(columnLabels.value.versionDate).toBe("Version Date");
        expect(columnTitles.value.versionDate).toBeUndefined();
    });

    it("abbreviates multi-word labels when shrinkColumnLabels is true, with a full-name title", () => {
        const { shrinkColumnLabels, columnLabels, columnTitles } = useColumnPreferences();

        shrinkColumnLabels.value = true;

        expect(columnLabels.value.versionDate).toBe("VD");
        expect(columnTitles.value.versionDate).toBe("Version Date");
    });

    it("leaves a single-word label untouched even when shrinkColumnLabels is true", () => {
        const { shrinkColumnLabels, columnLabels, columnTitles } = useColumnPreferences();

        shrinkColumnLabels.value = true;

        expect(columnLabels.value.deprecated).toBe("Deprecated");
        expect(columnTitles.value.deprecated).toBeUndefined();
    });
});
