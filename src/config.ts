import { DEFAULT_FETCH_CONCURRENCY } from "./constants";

/**
 * Developer settings read from `.env` at build time (see `.env.example`).
 * VITE_* values are inlined into the client bundle, so never ship a
 * privileged token in a public build.
 */
export const config = {
    githubToken: import.meta.env.VITE_GITHUB_TOKEN || undefined,
    fetchConcurrency: Number(import.meta.env.VITE_FETCH_CONCURRENCY) || DEFAULT_FETCH_CONCURRENCY,
};
