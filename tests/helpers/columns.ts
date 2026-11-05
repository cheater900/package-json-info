import { TOGGLEABLE_COLUMNS } from "../../src/core/utils/tableColumns";

/** Every toggleable column key except the given ones. */
export function columnKeysExcept(...excluded: string[]): string[] {
    return TOGGLEABLE_COLUMNS.map((c) => c.key).filter((key) => !excluded.includes(key));
}
