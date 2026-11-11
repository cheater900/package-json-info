import {
    HEALTH_BAND_FAIR_MIN,
    HEALTH_BAND_GOOD_MIN,
    HEALTH_ISSUE_RATIO_WORST,
    HEALTH_MAINTAINERS_BEST,
    HEALTH_SCORE_MAX,
    HEALTH_STALE_FRESH_MONTHS,
    HEALTH_STALE_WORST_MONTHS,
    HEALTH_WEIGHT_DEPRECATED,
    HEALTH_WEIGHT_ISSUES,
    HEALTH_WEIGHT_MAINTAINERS,
    HEALTH_WEIGHT_OUTDATED,
    HEALTH_WEIGHT_RELEASE_AGE,
    HEALTH_WEIGHT_VULNERABILITIES,
    MS_PER_MONTH,
} from "../constants";
import type { PackageInfo } from "../types";

/** Row fields the score reads. A null field means "signal unavailable", not "bad". */
export type HealthSignals = Pick<
    PackageInfo,
    | "latestReleaseDate"
    | "isOutdated"
    | "maintainers"
    | "openIssues"
    | "closedIssues"
    | "vulnerabilityCount"
> & {
    /** Deprecation notice, null when not deprecated, undefined when unknown. */
    deprecated: string | null | undefined;
};

export type HealthScore = {
    /** 0-100 integer, higher = healthier. */
    score: number;
    /** Keys of the signals that were available and used. */
    signals: string[];
};

export type HealthBand = "good" | "fair" | "poor";

type SignalSpec = {
    key: string;
    weight: number;
    /** 0 (worst) to 1 (best), or null when the signal is unavailable. */
    rate: (signals: HealthSignals, now: Date) => number | null;
};

function clampUnit(value: number): number {
    return Math.min(1, Math.max(0, value));
}

function rateReleaseAge({ latestReleaseDate }: HealthSignals, now: Date): number | null {
    const releasedAt = new Date(latestReleaseDate ?? "").getTime();
    if (Number.isNaN(releasedAt)) {
        return null;
    }
    const months = (now.getTime() - releasedAt) / MS_PER_MONTH;
    const staleSpan = HEALTH_STALE_WORST_MONTHS - HEALTH_STALE_FRESH_MONTHS;
    return 1 - clampUnit((months - HEALTH_STALE_FRESH_MONTHS) / staleSpan);
}

function rateDeprecated({ deprecated }: HealthSignals): number | null {
    if (deprecated === undefined) {
        return null;
    }
    return deprecated === null ? 1 : 0;
}

function rateOutdated({ isOutdated }: HealthSignals): number | null {
    if (isOutdated == null) {
        return null;
    }
    return isOutdated ? 0 : 1;
}

function rateMaintainers({ maintainers }: HealthSignals): number | null {
    if (!maintainers || maintainers.length === 0) {
        return null;
    }
    return clampUnit((maintainers.length - 1) / (HEALTH_MAINTAINERS_BEST - 1));
}

function rateIssues({ openIssues, closedIssues }: HealthSignals): number | null {
    if (openIssues == null || closedIssues == null || openIssues + closedIssues <= 0) {
        return null;
    }
    const openRatio = openIssues / (openIssues + closedIssues);
    return 1 - clampUnit(openRatio / HEALTH_ISSUE_RATIO_WORST);
}

function rateVulnerabilities({ vulnerabilityCount }: HealthSignals): number | null {
    if (vulnerabilityCount == null) {
        return null;
    }
    return vulnerabilityCount > 0 ? 0 : 1;
}

const SIGNAL_SPECS: SignalSpec[] = [
    { key: "releaseAge", weight: HEALTH_WEIGHT_RELEASE_AGE, rate: rateReleaseAge },
    { key: "deprecated", weight: HEALTH_WEIGHT_DEPRECATED, rate: rateDeprecated },
    { key: "outdated", weight: HEALTH_WEIGHT_OUTDATED, rate: rateOutdated },
    { key: "maintainers", weight: HEALTH_WEIGHT_MAINTAINERS, rate: rateMaintainers },
    { key: "issues", weight: HEALTH_WEIGHT_ISSUES, rate: rateIssues },
    { key: "vulnerabilities", weight: HEALTH_WEIGHT_VULNERABILITIES, rate: rateVulnerabilities },
];

/**
 * Weighted average over the available signals only, so a hidden column or a
 * failed lookup never lowers the score.
 *
 * @returns null when no signal is available.
 */
export function computeHealthScore(signals: HealthSignals, now: Date): HealthScore | null {
    const used: string[] = [];
    let weightSum = 0;
    let weightedRateSum = 0;
    for (const spec of SIGNAL_SPECS) {
        const rate = spec.rate(signals, now);
        if (rate == null) {
            continue;
        }
        used.push(spec.key);
        weightSum += spec.weight;
        weightedRateSum += spec.weight * rate;
    }
    if (used.length === 0) {
        return null;
    }
    return { score: Math.round((weightedRateSum / weightSum) * HEALTH_SCORE_MAX), signals: used };
}

export function healthBand(score: number): HealthBand {
    if (score >= HEALTH_BAND_GOOD_MIN) {
        return "good";
    }
    return score >= HEALTH_BAND_FAIR_MIN ? "fair" : "poor";
}
