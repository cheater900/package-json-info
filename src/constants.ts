export const NPM_REGISTRY_URL = "https://registry.npmjs.org";
export const NPM_WEEKLY_DOWNLOADS_URL = "https://api.npmjs.org/downloads/point/last-week";
export const OSV_QUERY_URL = "https://api.osv.dev/v1/query";
export const OSV_NPM_ECOSYSTEM = "npm";
/** OSV result pages followed per package; a real package needs one or two. */
export const OSV_MAX_PAGES = 10;
export const BUNDLEPHOBIA_SIZE_URL = "https://bundlephobia.com/api/size";

export const GITHUB_HOST = "github.com";
export const GITLAB_HOST = "gitlab.com";
export const CODEBERG_HOST = "codeberg.org";
/** Repo hosts the app can read stars and a raw package.json from. */
export const SUPPORTED_REPO_HOSTS = [GITHUB_HOST, GITLAB_HOST, CODEBERG_HOST];

export const GITHUB_API_URL = "https://api.github.com";
export const GITHUB_RAW_URL = "https://raw.githubusercontent.com";
export const GITHUB_RATE_LIMIT_URL = `${GITHUB_API_URL}/rate_limit`;
export const GITHUB_ACCEPT_HEADER = "application/vnd.github+json";
/** Path segments after `/<owner>/<repo>` in a GitHub file or folder page URL. */
export const GITHUB_URL_VIEW_BLOB = "blob";
export const GITHUB_URL_VIEW_TREE = "tree";
/** Classic and fine-grained PATs: letters, digits and underscores only. */
export const GITHUB_TOKEN_PATTERN = /^[A-Za-z0-9_]{1,255}$/;
export const GITLAB_API_URL = "https://gitlab.com/api/v4";
export const CODEBERG_API_URL = "https://codeberg.org/api/v1";

/** Branches probed, in order, for a repo URL's package.json. */
export const DEFAULT_BRANCH_CANDIDATES = ["main", "master"];

export const DEFAULT_FETCH_CONCURRENCY = 5;
export const DEFAULT_FETCH_TIMEOUT_MS = 30_000;
/** Largest delay browser timers honor; a bigger timeout overflows and fires at once. */
export const MAX_CONFIG_INT = 2 ** 31 - 1;
export const HTTP_HEADER_AUTHORIZATION = "Authorization";
export const HTTP_NOT_FOUND = 404;
export const HTTP_CONFLICT = 409;

/** Look-back window of the commit-activity lookup. */
export const COMMIT_ACTIVITY_WINDOW_DAYS = 365;
/** Commits requested per activity lookup; commitsLastYear tops out here. */
export const COMMIT_ACTIVITY_SAMPLE_SIZE = 12;
export const HTTP_UNAUTHORIZED = 401;
/** Marks where a CORS proxy template puts the encoded target URL; without it the proxy is a prefix. */
export const PROXY_URL_PLACEHOLDER = "{url}";
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

/** Cell text shown when a value is unavailable. */
export const MISSING_VALUE = "-";
/** Cell text shown when the lookup behind a value failed with nothing stored. */
export const FAILED_VALUE = "?";
export const NUMBER_LOCALE = "en-US";
/** Spaces per level when the app pretty-prints a package.json. */
export const JSON_INDENT = 2;
export const BYTES_PER_KB = 1024;
export const BYTES_PER_MB = BYTES_PER_KB * BYTES_PER_KB;
/** Unpacked size cap for browsing a tarball; real npm packages stay far below it. */
export const MAX_UNPACKED_TARBALL_BYTES = 256 * BYTES_PER_MB;
/** Deepest path the file tree accepts; no real file system nests this far. */
export const MAX_FILE_TREE_DEPTH = 1000;
/** Most entries the file tree lists; one folder holding more stalls rendering. */
export const MAX_FILE_TREE_ENTRIES = 20_000;
/** Largest file the source viewer shows; bigger text stalls the tab. */
export const MAX_VIEWED_FILE_BYTES = 2 * BYTES_PER_MB;

/** Most requests the network log keeps; older ones drop first. */
export const NETWORK_LOG_MAX_ENTRIES = 1000;

export const TOOLTIP_OFFSET_PX = 6;

/** Average month length (365.25 days / 12). */
export const MS_PER_MONTH = 30.4375 * 24 * 60 * 60 * 1000;
export const HEALTH_SCORE_MAX = 100;
/** Relative weight of each health signal; only available signals count. */
export const HEALTH_WEIGHT_RELEASE_AGE = 3;
export const HEALTH_WEIGHT_DEPRECATED = 6;
export const HEALTH_WEIGHT_OUTDATED = 2;
export const HEALTH_WEIGHT_MAINTAINERS = 1;
export const HEALTH_WEIGHT_ISSUES = 1;
export const HEALTH_WEIGHT_VULNERABILITIES = 2;
/** Latest release younger than this costs nothing; the penalty grows linearly up to the worst age. */
export const HEALTH_STALE_FRESH_MONTHS = 6;
export const HEALTH_STALE_WORST_MONTHS = 24;
/** Maintainer count that earns the full maintainer rating; 1 maintainer earns none. */
export const HEALTH_MAINTAINERS_BEST = 3;
/** Open share of all issues that earns no issue rating. */
export const HEALTH_ISSUE_RATIO_WORST = 0.5;
/** Lowest score of the good and fair bands; anything lower is poor. */
export const HEALTH_BAND_GOOD_MIN = 70;
export const HEALTH_BAND_FAIR_MIN = 40;

export const PACKAGE_JSON_FILE = "package.json";
export const PNPM_WORKSPACE_FILE = "pnpm-workspace.yaml";
/** Workspace patterns come from the loaded repository; the caps bound the matching work. */
export const MAX_WORKSPACE_PATTERNS = 100;
export const MAX_WORKSPACE_PATTERN_LENGTH = 200;
/** Total matching steps for one repo; a crafted repo cannot stall the tab past this. */
export const MAX_WORKSPACE_MATCH_STEPS = 50_000_000;
export const MAX_WORKSPACE_DIRS = 5_000;
