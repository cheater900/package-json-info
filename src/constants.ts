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
export const GITHUB_ACCEPT_HEADER = "application/vnd.github+json";
export const GITLAB_API_URL = "https://gitlab.com/api/v4";
export const CODEBERG_API_URL = "https://codeberg.org/api/v1";

/** Branches probed, in order, for a repo URL's package.json. */
export const DEFAULT_BRANCH_CANDIDATES = ["main", "master"];

export const DEFAULT_FETCH_CONCURRENCY = 5;
export const DEFAULT_FETCH_TIMEOUT_MS = 30_000;
/** Largest delay browser timers honor; a bigger timeout overflows and fires at once. */
export const MAX_CONFIG_INT = 2 ** 31 - 1;
export const HTTP_NOT_FOUND = 404;
/** Delay before mirroring the URL input into the address bar; browsers throttle replaceState. */
export const URL_SYNC_DEBOUNCE_MS = 300;

const STORAGE_KEY_NAMESPACE = "package-json-info";
export const STORAGE_KEY_VISIBLE_COLUMNS = `${STORAGE_KEY_NAMESPACE}:visibleColumns`;
export const STORAGE_KEY_COLUMN_ORDER = `${STORAGE_KEY_NAMESPACE}:columnOrder`;
export const STORAGE_KEY_SHRINK_LABELS = `${STORAGE_KEY_NAMESPACE}:shrinkColumnLabels`;

export const INPUT_URL_QUERY_PARAM = "inputUrl";

/** Cell text shown when a value is unavailable. */
export const MISSING_VALUE = "-";
export const NUMBER_LOCALE = "en-US";
/** Spaces per level when the app pretty-prints a package.json. */
export const JSON_INDENT = 2;
export const BYTES_PER_KB = 1024;
export const BYTES_PER_MB = BYTES_PER_KB * BYTES_PER_KB;
/** Unpacked size cap for browsing a tarball; real npm packages stay far below it. */
export const MAX_UNPACKED_TARBALL_BYTES = 256 * BYTES_PER_MB;

export const TOOLTIP_OFFSET_PX = 6;
