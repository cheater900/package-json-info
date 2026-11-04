import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { hasMessage, t } from "../../../src/i18n";
import { HEALTH_FILTER_SECTIONS } from "../../../src/utils/healthFilters";
import { DEPENDENCY_TABLE_COLUMNS } from "../../../src/utils/tableColumns";

const SRC_DIR = join(__dirname, "../../../src");
const LITERAL_KEY_PATTERN = /\bt\(\s*["']([\w.]+)["']/g;

function sourceFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
            return sourceFiles(path);
        }
        return /\.(ts|vue)$/.test(entry.name) ? [path] : [];
    });
}

describe("t", () => {
    it("returns message for key", () => {
        expect(t("errors.fileRead")).toBe("Failed to read the selected file.");
    });

    it("fills placeholders from params", () => {
        expect(t("history.position", { current: 2, total: 5 })).toBe("2 / 5");
    });

    it("keeps placeholder without matching param", () => {
        expect(t("history.position", { current: 2 })).toBe("2 / {total}");
    });

    it("returns key for unknown message", () => {
        expect(t("no.such.key")).toBe("no.such.key");
    });

    it("returns key for non-leaf key", () => {
        expect(t("errors")).toBe("errors");
    });
});

describe("message catalog", () => {
    it("defines every literal key used in src", () => {
        const keys = sourceFiles(SRC_DIR).flatMap((file) =>
            [...readFileSync(file, "utf8").matchAll(LITERAL_KEY_PATTERN)].map((m) => m[1]),
        );

        expect(keys.length).toBeGreaterThan(0);
        expect(keys.filter((key) => t(key) === key)).toEqual([]);
    });

    it("labels every table column", () => {
        const unlabeled = DEPENDENCY_TABLE_COLUMNS.filter((c) => c.label === `columns.${c.key}`);

        expect(unlabeled).toEqual([]);
    });

    it("labels every health filter section + preset", () => {
        const keys = HEALTH_FILTER_SECTIONS.flatMap((section) => [
            `filters.sections.${section.id}`,
            ...section.presets.map((preset) => `filters.presets.${section.id}.${preset.id}`),
        ]);

        expect(keys.filter((key) => !hasMessage(key))).toEqual([]);
    });
});
