/** Classic and fine-grained PATs: letters, digits and underscores only. */
export const GITHUB_TOKEN_PATTERN = /^[A-Za-z0-9_]{1,255}$/;
/** Delay before mirroring the URL input into the address bar; browsers throttle replaceState. */
export const URL_SYNC_DEBOUNCE_MS = 300;

const STORAGE_KEY_NAMESPACE = "package-json-info";
export const STORAGE_KEY_VISIBLE_COLUMNS = `${STORAGE_KEY_NAMESPACE}:visibleColumns`;
export const STORAGE_KEY_COLUMN_ORDER = `${STORAGE_KEY_NAMESPACE}:columnOrder`;
export const STORAGE_KEY_SHRINK_LABELS = `${STORAGE_KEY_NAMESPACE}:shrinkColumnLabels`;
export const STORAGE_KEY_SETTINGS = `${STORAGE_KEY_NAMESPACE}:settings`;
/** Encrypted GitHub token (IV + ciphertext); its AES key lives in IndexedDB. */
export const STORAGE_KEY_GITHUB_TOKEN = `${STORAGE_KEY_NAMESPACE}:githubToken`;
export const TOKEN_DB_NAME = STORAGE_KEY_NAMESPACE;
export const TOKEN_DB_STORE = "cryptoKeys";
export const TOKEN_DB_KEY = "githubToken";
export const TOKEN_CIPHER = { name: "AES-GCM", length: 256 } as const;
/** AES-GCM nonce length recommended by NIST SP 800-38D. */
export const TOKEN_IV_BYTES = 12;
/** Longest wait for the stored token before mounting; IndexedDB open can hang (seen in Safari). */
export const TOKEN_LOAD_TIMEOUT_MS = 2000;
/** Own database: the token database opens without a version, so it cannot gain a second store. */
export const LOOKUP_DB_NAME = `${STORAGE_KEY_NAMESPACE}:lookups`;
export const LOOKUP_DB_STORE = "lookups";
/** Longest wait for a stored lookup before the live error shows; IndexedDB open can hang. */
export const LOOKUP_READ_TIMEOUT_MS = 2000;

/** Options offered by the settings menu's Display section; the first theme is the default. */
export const SETTINGS_THEMES = ["green", "light", "system"] as const;
export const SETTINGS_FONT_SCALES = [0.875, 1, 1.125, 1.25] as const;
export const SETTINGS_SPACE_SCALES = [0.75, 1, 1.25] as const;

export const INPUT_URL_QUERY_PARAM = "inputUrl";
/** Repeated query param; each value is one step of the shared drill-down chain. */
export const SHARE_STEP_QUERY_PARAM = "step";
/** Share links come from anyone; the caps bound the requests one link starts. */
export const MAX_SHARE_STEPS = 20;
export const MAX_SHARE_STEP_LENGTH = 2000;

/** Most requests the network log keeps; older ones drop first. */
export const NETWORK_LOG_MAX_ENTRIES = 1000;

export const TOOLTIP_OFFSET_PX = 6;
