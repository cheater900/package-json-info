import { describe, it, expect } from "vitest";
import {
    buildExportDocument,
    exportFileBaseName,
} from "../../../../src/utils/export/buildExportDocument";
import { fmtDate } from "../../../../src/utils/dependencyRowFormatting";
import { FAILED_VALUE, MISSING_VALUE } from "../../../../src/constants";
import { fullDependency, sparseDependency } from "../../../fixtures/dependencies";

const errorRow = { name: "broken", version: "1.0.0", error: "404" };

function build(keys: string[], query = "") {
    return buildExportDocument(
        "my-app",
        [
            { title: "Deps", dependencies: [fullDependency, errorRow] },
            { title: "Dev Deps", dependencies: [sparseDependency] },
        ],
        keys,
        query,
    );
}

describe("buildExportDocument", () => {
    it("puts Name first, then visible columns in given order, full labels", () => {
        const doc = build(["license", "versionDate", "latestReleaseDate"]);
        expect(doc.title).toBe("my-app");
        expect(doc.sectionHeader).toBe("Section");
        expect(doc.sections.map((s) => s.title)).toEqual(["Deps", "Dev Deps"]);
        expect(doc.sections[0].headers).toEqual([
            "Name",
            "License",
            "Version Date",
            "Latest release date",
        ]);
        expect(doc.sections[0].rows[0]).toEqual([
            "left-pad",
            "MIT",
            fmtDate(fullDependency.versionDate),
            fmtDate(fullDependency.latestReleaseDate),
        ]);
    });

    it("leaves out hidden and unknown columns", () => {
        const doc = build(["version", "nope"]);
        expect(doc.sections[0].headers).toEqual(["Name", "Version"]);
        expect(doc.sections[1].rows).toEqual([["no-data-pkg", "0.0.1"]]);
    });

    it("drops button column", () => {
        const doc = build(["sourceCodeTree", "version"]);
        expect(doc.sections[0].headers).toEqual(["Name", "Version"]);
    });

    it("exports link column as raw URL or missing marker", () => {
        const doc = build(["sourceCode"]);
        expect(doc.sections[0].rows[0]).toEqual(["left-pad", fullDependency.sourceCode]);
        expect(doc.sections[1].rows[0]).toEqual(["no-data-pkg", MISSING_VALUE]);
    });

    it("formats cells like table", () => {
        const doc = build(["healthScore", "weeklyDownloads", "isOutdated", "maintainers"]);
        expect(doc.sections[0].rows[0]).toEqual([
            "left-pad",
            "55 fair",
            "4,242",
            "Yes",
            "alice, bob",
        ]);
    });

    it("marks failed lookup", () => {
        const failed = { ...fullDependency, failedLookups: { gitStars: "timeout" } };
        const doc = buildExportDocument(
            "x",
            [{ title: "Deps", dependencies: [failed] }],
            ["gitStars", "version"],
            "",
        );
        expect(doc.sections[0].rows[0]).toEqual(["left-pad", FAILED_VALUE, "1.2.0"]);
    });

    it("puts error message in first data cell, rest empty", () => {
        const doc = build(["version", "license"]);
        expect(doc.sections[0].rows[1]).toEqual(["broken", "Could not load package data: 404", ""]);
    });

    it("keeps only name for error row without data columns", () => {
        const doc = build(["sourceCodeTree"]);
        expect(doc.sections[0].rows[1]).toEqual(["broken"]);
    });

    it("filters rows by search query", () => {
        const doc = build(["version"], "PAD");
        expect(doc.sections[0].rows).toEqual([["left-pad", "1.2.0"]]);
        expect(doc.sections[1].rows).toEqual([]);
    });
});

describe("exportFileBaseName", () => {
    it("slugs scoped name", () => {
        expect(exportFileBaseName("@Vue/Test Utils")).toBe("vue-test-utils-dependencies");
    });

    it("falls back to suffix for empty slug", () => {
        expect(exportFileBaseName("@@@")).toBe("dependencies");
    });
});
