import { NUMBER_LOCALE } from "../constants";

const PERCENT_FORMAT = new Intl.NumberFormat(NUMBER_LOCALE, { style: "percent" });

/** Formats a ratio as a whole percentage: 0.875 -> "88%". */
export function formatPercent(ratio: number): string {
    return PERCENT_FORMAT.format(ratio);
}
