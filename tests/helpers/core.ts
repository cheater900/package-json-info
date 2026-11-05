import { CORE_SETTINGS_DEFAULTS, configureCore, resetCore } from "../../src/core/runtime";
import type { CoreSettings } from "../../src/core/runtime";

/** Settings core reads in core tests; edit fields to change them. */
export const coreSettings: CoreSettings = { ...CORE_SETTINGS_DEFAULTS };

/** Default runtime reading `coreSettings`, reset to defaults. */
export function resetCoreRuntime() {
    Object.assign(coreSettings, CORE_SETTINGS_DEFAULTS);
    resetCore();
    configureCore({ settings: () => coreSettings });
}
