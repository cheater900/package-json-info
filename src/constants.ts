export const NPM_REGISTRY_URL = "https://registry.npmjs.org";
export const NPM_WEEKLY_DOWNLOADS_URL = "https://api.npmjs.org/downloads/point/last-week";
export const OSV_QUERY_URL = "https://api.osv.dev/v1/query";
export const OSV_NPM_ECOSYSTEM = "npm";
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
export const HTTP_NOT_FOUND = 404;

const STORAGE_KEY_PREFIX = "package-json-info";
export const VISIBLE_COLUMNS_STORAGE_KEY = `${STORAGE_KEY_PREFIX}:visibleColumns`;
export const COLUMN_ORDER_STORAGE_KEY = `${STORAGE_KEY_PREFIX}:columnOrder`;
export const SHRINK_LABELS_STORAGE_KEY = `${STORAGE_KEY_PREFIX}:shrinkColumnLabels`;

export const INPUT_URL_QUERY_PARAM = "inputUrl";

/** Cell text shown when a value is unavailable. */
export const MISSING_VALUE = "-";
export const NUMBER_LOCALE = "en-US";
export const BYTES_PER_KB = 1024;

export const TOOLTIP_OFFSET_PX = 6;
