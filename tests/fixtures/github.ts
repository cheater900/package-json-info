/** Well-formed fine-grained PAT; never a real token. */
export const githubTokenFixture = "github_pat_abc123";

export const githubRateLimit = { limit: 5000, remaining: 4999 };

/** GitHub `/rate_limit` body; `used` shows extra fields are dropped. */
export const githubRateLimitBody = { rate: { ...githubRateLimit, used: 1 } };

/** Text the settings menu shows for githubRateLimit. */
export const githubRateLimitText = `${githubRateLimit.remaining} / ${githubRateLimit.limit}`;
