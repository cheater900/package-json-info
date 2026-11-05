import { describe, it, expect } from "vitest";
import { COLUMN_ICONS } from "../../../../src/app/components/columnIcons";
import { DEPENDENCY_TABLE_COLUMNS } from "../../../../src/core/utils/tableColumns";

describe("COLUMN_ICONS", () => {
    it("has icon for every column", () => {
        const missing = DEPENDENCY_TABLE_COLUMNS.filter((c) => !COLUMN_ICONS[c.key]);

        expect(missing.map((c) => c.key)).toEqual([]);
    });

    it("gives each column distinct icon", () => {
        const icons = Object.values(COLUMN_ICONS);

        expect(new Set(icons).size).toBe(icons.length);
    });
});
