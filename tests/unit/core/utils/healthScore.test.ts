import { describe, it, expect } from "vitest";
import { computeHealthScore, healthBand } from "../../../../src/core/utils/healthScore";
import type { HealthSignals } from "../../../../src/core/utils/healthScore";
import {
    HEALTH_BAND_FAIR_MIN,
    HEALTH_BAND_GOOD_MIN,
    HEALTH_WEIGHT_DEPRECATED,
    HEALTH_WEIGHT_OUTDATED,
} from "../../../../src/core/constants";

const NOW = new Date("2026-01-01T00:00:00.000Z");

const NO_SIGNALS: HealthSignals = {
    latestReleaseDate: null,
    deprecated: undefined,
    isOutdated: null,
    maintainers: null,
    openIssues: null,
    closedIssues: null,
    vulnerabilityCount: null,
};

function scoreOf(signals: Partial<HealthSignals>) {
    return computeHealthScore({ ...NO_SIGNALS, ...signals }, NOW);
}

describe("computeHealthScore", () => {
    it("returns null without signals", () => {
        expect(scoreOf({})).toBeNull();
    });

    describe("release age", () => {
        it("scores 100 for release within 6 months", () => {
            expect(scoreOf({ latestReleaseDate: "2025-09-01T00:00:00.000Z" })).toEqual({
                score: 100,
                signals: ["releaseAge"],
            });
        });

        it("scores 50 for release 15 months ago", () => {
            expect(scoreOf({ latestReleaseDate: "2024-10-01T00:00:00.000Z" })?.score).toBe(50);
        });

        it("scores 0 for release 2 years ago or older", () => {
            expect(scoreOf({ latestReleaseDate: "2024-01-01T00:00:00.000Z" })?.score).toBe(0);
            expect(scoreOf({ latestReleaseDate: "2015-01-01T00:00:00.000Z" })?.score).toBe(0);
        });

        it("scores 100 for release date after now", () => {
            expect(scoreOf({ latestReleaseDate: "2026-06-01T00:00:00.000Z" })?.score).toBe(100);
        });

        it("skips invalid date", () => {
            expect(scoreOf({ latestReleaseDate: "not a date" })).toBeNull();
        });
    });

    describe("deprecated", () => {
        it("scores 0 for deprecation notice", () => {
            expect(scoreOf({ deprecated: "use other-pkg" })).toEqual({
                score: 0,
                signals: ["deprecated"],
            });
        });

        it("scores 100 for null notice", () => {
            expect(scoreOf({ deprecated: null })?.score).toBe(100);
        });
    });

    describe("outdated", () => {
        it("scores 0 for outdated version", () => {
            expect(scoreOf({ isOutdated: true })).toEqual({ score: 0, signals: ["outdated"] });
        });

        it("scores 100 for current version", () => {
            expect(scoreOf({ isOutdated: false })?.score).toBe(100);
        });
    });

    describe("maintainers", () => {
        it("scores 0 for 1 maintainer", () => {
            expect(scoreOf({ maintainers: ["alice"] })).toEqual({
                score: 0,
                signals: ["maintainers"],
            });
        });

        it("scores 50 for 2 maintainers", () => {
            expect(scoreOf({ maintainers: ["alice", "bob"] })?.score).toBe(50);
        });

        it("scores 100 for 3 or more maintainers", () => {
            expect(scoreOf({ maintainers: ["a", "b", "c"] })?.score).toBe(100);
            expect(scoreOf({ maintainers: ["a", "b", "c", "d"] })?.score).toBe(100);
        });

        it("skips empty list", () => {
            expect(scoreOf({ maintainers: [] })).toBeNull();
        });
    });

    describe("issues", () => {
        it("scores 100 with 0 open issues", () => {
            expect(scoreOf({ openIssues: 0, closedIssues: 10 })).toEqual({
                score: 100,
                signals: ["issues"],
            });
        });

        it("scores 50 with 25% open issues", () => {
            expect(scoreOf({ openIssues: 25, closedIssues: 75 })?.score).toBe(50);
        });

        it("scores 0 with 50% or more open issues", () => {
            expect(scoreOf({ openIssues: 5, closedIssues: 5 })?.score).toBe(0);
            expect(scoreOf({ openIssues: 9, closedIssues: 1 })?.score).toBe(0);
        });

        it("skips ratio with one count null", () => {
            expect(scoreOf({ openIssues: 3, closedIssues: null })).toBeNull();
            expect(scoreOf({ openIssues: null, closedIssues: 3 })).toBeNull();
        });

        it("skips ratio with 0 issues in total", () => {
            expect(scoreOf({ openIssues: 0, closedIssues: 0 })).toBeNull();
        });
    });

    describe("vulnerabilities", () => {
        it("scores 0 with known vulnerabilities", () => {
            expect(scoreOf({ vulnerabilityCount: 2 })).toEqual({
                score: 0,
                signals: ["vulnerabilities"],
            });
        });

        it("scores 100 with 0 vulnerabilities", () => {
            expect(scoreOf({ vulnerabilityCount: 0 })?.score).toBe(100);
        });
    });

    it("averages available signals by weight", () => {
        const result = scoreOf({ deprecated: null, isOutdated: true });
        const weightSum = HEALTH_WEIGHT_DEPRECATED + HEALTH_WEIGHT_OUTDATED;

        expect(result).toEqual({
            score: Math.round((HEALTH_WEIGHT_DEPRECATED / weightSum) * 100),
            signals: ["deprecated", "outdated"],
        });
    });

    it("keeps score unchanged by unavailable signals", () => {
        const withNulls = scoreOf({
            isOutdated: false,
            vulnerabilityCount: null,
            maintainers: null,
        });

        expect(withNulls).toEqual({ score: 100, signals: ["outdated"] });
    });

    it("scores 100 with every signal healthy", () => {
        const result = scoreOf({
            latestReleaseDate: "2025-12-01T00:00:00.000Z",
            deprecated: null,
            isOutdated: false,
            maintainers: ["a", "b", "c"],
            openIssues: 0,
            closedIssues: 4,
            vulnerabilityCount: 0,
        });

        expect(result).toEqual({
            score: 100,
            signals: [
                "releaseAge",
                "deprecated",
                "outdated",
                "maintainers",
                "issues",
                "vulnerabilities",
            ],
        });
    });
});

describe("healthBand", () => {
    it("returns good from good threshold up", () => {
        expect(healthBand(100)).toBe("good");
        expect(healthBand(HEALTH_BAND_GOOD_MIN)).toBe("good");
    });

    it("returns fair between fair and good thresholds", () => {
        expect(healthBand(HEALTH_BAND_GOOD_MIN - 1)).toBe("fair");
        expect(healthBand(HEALTH_BAND_FAIR_MIN)).toBe("fair");
    });

    it("returns poor below fair threshold", () => {
        expect(healthBand(HEALTH_BAND_FAIR_MIN - 1)).toBe("poor");
        expect(healthBand(0)).toBe("poor");
    });
});
