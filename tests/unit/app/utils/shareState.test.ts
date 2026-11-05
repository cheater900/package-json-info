import { describe, it, expect } from "vitest";
import { encodeSteps, hrefWithSteps, parseSteps } from "../../../../src/app/utils/shareState";
import { createHistoryEntry } from "../../../../src/app/utils/packageJsonHistory";
import type { EntrySource } from "../../../../src/app/utils/packageJsonHistory";
import { MAX_SHARE_STEP_LENGTH, MAX_SHARE_STEPS } from "../../../../src/app/constants";

const SOURCE_URL: EntrySource = { kind: "url", url: "https://github.com/o/r?ref=a&b=c#top" };
const SOURCE_WORKSPACE: EntrySource = { kind: "workspace", path: "packages/deep/a" };
const SOURCE_SCOPED: EntrySource = { kind: "dependency", name: "@scope/pkg", version: "^1.0.0" };
const SOURCE_PLAIN: EntrySource = { kind: "dependency", name: "left-pad", version: "1.3.0" };

function historyOf(sources: (EntrySource | null)[]) {
    return sources.map((source) => createHistoryEntry("{}", {}, null, source));
}

function searchOf(steps: string[]) {
    return new URL(hrefWithSteps("https://h.example/", steps)).search;
}

describe("encodeSteps", () => {
    it("encodes url, workspace, dependency entries up to index", () => {
        const history = historyOf([SOURCE_URL, SOURCE_WORKSPACE, SOURCE_SCOPED, SOURCE_PLAIN]);

        expect(encodeSteps(history, 2)).toEqual([
            "url:https://github.com/o/r?ref=a&b=c#top",
            "ws:packages/deep/a",
            "dep:@scope/pkg@^1.0.0",
        ]);
    });

    it("skips entries without source", () => {
        const history = historyOf([null, SOURCE_URL, null, SOURCE_PLAIN]);

        expect(encodeSteps(history, 3)).toEqual([
            "url:https://github.com/o/r?ref=a&b=c#top",
            "dep:left-pad@1.3.0",
        ]);
    });

    it("returns no steps for empty history", () => {
        expect(encodeSteps([], -1)).toEqual([]);
    });
});

describe("parseSteps", () => {
    it("round-trips url, workspace path with slashes, scoped and plain dependency", () => {
        const sources = [SOURCE_URL, SOURCE_WORKSPACE, SOURCE_SCOPED, SOURCE_PLAIN];

        const search = searchOf(encodeSteps(historyOf(sources), sources.length - 1));

        expect(parseSteps(search)).toEqual(sources);
    });

    it("round-trips root workspace and range holding @", () => {
        const sources: EntrySource[] = [
            SOURCE_URL,
            { kind: "workspace", path: "" },
            { kind: "dependency", name: "alias", version: "npm:@scope/real@^2.0.0" },
        ];

        const search = searchOf(encodeSteps(historyOf(sources), sources.length - 1));

        expect(parseSteps(search)).toEqual(sources);
    });

    it("returns no steps without step param", () => {
        expect(parseSteps("")).toEqual([]);
        expect(parseSteps("?inputUrl=https%3A%2F%2Fa.example")).toEqual([]);
    });

    it.each([
        ["unknown prefix", "file:/etc/passwd"],
        ["no prefix", "left-pad"],
        ["non-http URL", "url:javascript:alert(1)"],
        ["scheme-less URL", "url:example.com/package.json"],
        ["dependency without range separator", "dep:left-pad"],
        ["scoped dependency without range separator", "dep:@scope/pkg"],
        ["oversized step", `dep:left-pad@${"1".repeat(MAX_SHARE_STEP_LENGTH)}`],
    ])("ends list at %s, keeps earlier steps", (_case, badStep) => {
        const search = searchOf(["dep:a@1.0.0", badStep, "dep:b@1.0.0"]);

        expect(parseSteps(search)).toEqual([{ kind: "dependency", name: "a", version: "1.0.0" }]);
    });

    it("ends list at ws step without url or ws step before it", () => {
        expect(parseSteps(searchOf(["ws:packages/a", "dep:a@1.0.0"]))).toEqual([]);
        expect(parseSteps(searchOf(["dep:a@1.0.0", "ws:packages/a"]))).toEqual([
            { kind: "dependency", name: "a", version: "1.0.0" },
        ]);
    });

    it(`keeps first ${MAX_SHARE_STEPS} steps`, () => {
        const steps = Array.from({ length: MAX_SHARE_STEPS + 5 }, (_, i) => `dep:pkg-${i}@1.0.0`);

        const sources = parseSteps(searchOf(steps));

        expect(sources).toHaveLength(MAX_SHARE_STEPS);
        expect(sources.at(-1)).toEqual({
            kind: "dependency",
            name: `pkg-${MAX_SHARE_STEPS - 1}`,
            version: "1.0.0",
        });
    });
});

describe("hrefWithSteps", () => {
    it("replaces old steps, keeps path, other params, hash", () => {
        const href = hrefWithSteps(
            "https://h.example/app/?foo=bar&step=dep%3Aold%401.0.0&inputUrl=https%3A%2F%2Fa.example#top",
            ["dep:new@2.0.0"],
        );

        expect(href).toBe(
            "https://h.example/app/?foo=bar&inputUrl=https%3A%2F%2Fa.example&step=dep%3Anew%402.0.0#top",
        );
    });

    it("drops step params for empty list", () => {
        expect(hrefWithSteps("https://h.example/app/?step=dep%3Aa%401&keep=1", [])).toBe(
            "https://h.example/app/?keep=1",
        );
        expect(hrefWithSteps("https://h.example/app/?step=dep%3Aa%401", [])).toBe(
            "https://h.example/app/",
        );
    });

    it("stays on same origin under path starting with //", () => {
        const href = hrefWithSteps("https://h.example//app/", ["dep:a@1.0.0"]);

        expect(new URL(href).origin).toBe("https://h.example");
        expect(new URL(href).pathname).toBe("//app/");
    });
});
