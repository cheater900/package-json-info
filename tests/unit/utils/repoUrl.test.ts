import { describe, it, expect } from "vitest";
import { parseRepoSlug, normaliseRepoUrl } from "../../../src/utils/repoUrl";

describe("parseRepoSlug", () => {
    it("parses plain https GitHub URL", () => {
        expect(parseRepoSlug("https://github.com/owner/repo")).toEqual({
            host: "github.com",
            owner: "owner",
            repo: "repo",
        });
    });

    it("parses git+https URL with .git suffix", () => {
        expect(parseRepoSlug("git+https://github.com/owner/repo.git")).toEqual({
            host: "github.com",
            owner: "owner",
            repo: "repo",
        });
    });

    it("parses git:// URL", () => {
        expect(parseRepoSlug("git://github.com/owner/repo.git")).toEqual({
            host: "github.com",
            owner: "owner",
            repo: "repo",
        });
    });

    it("parses ssh://git@ URL", () => {
        expect(parseRepoSlug("ssh://git@github.com/owner/repo.git")).toEqual({
            host: "github.com",
            owner: "owner",
            repo: "repo",
        });
    });

    it("parses scp-like git@host:owner/repo URL", () => {
        expect(parseRepoSlug("git@github.com:owner/repo.git")).toEqual({
            host: "github.com",
            owner: "owner",
            repo: "repo",
        });
    });

    it("parses github: shorthand", () => {
        expect(parseRepoSlug("github:owner/repo")).toEqual({
            host: "github.com",
            owner: "owner",
            repo: "repo",
        });
    });

    it("parses GitLab and Codeberg URLs", () => {
        expect(parseRepoSlug("https://gitlab.com/owner/repo")).toEqual({
            host: "gitlab.com",
            owner: "owner",
            repo: "repo",
        });
        expect(parseRepoSlug("https://codeberg.org/owner/repo")).toEqual({
            host: "codeberg.org",
            owner: "owner",
            repo: "repo",
        });
    });

    it("returns null for empty string or unsupported host", () => {
        expect(parseRepoSlug("")).toBeNull();
        expect(parseRepoSlug("https://bitbucket.org/owner/repo")).toBeNull();
    });
});

describe("normaliseRepoUrl", () => {
    it("returns null for missing URL", () => {
        expect(normaliseRepoUrl(undefined)).toBeNull();
        expect(normaliseRepoUrl("")).toBeNull();
    });

    it("strips git+ prefix and .git suffix", () => {
        expect(normaliseRepoUrl("git+https://example.com/owner/repo.git")).toBe(
            "https://example.com/owner/repo",
        );
    });

    it("rewrites git:// and ssh://git@ to https://", () => {
        expect(normaliseRepoUrl("git://example.com/owner/repo")).toBe(
            "https://example.com/owner/repo",
        );
        expect(normaliseRepoUrl("ssh://git@example.com/owner/repo")).toBe(
            "https://example.com/owner/repo",
        );
    });

    it("leaves https URL untouched", () => {
        expect(normaliseRepoUrl("https://example.com/owner/repo")).toBe(
            "https://example.com/owner/repo",
        );
    });
});

describe("parseRepoSlug host matching", () => {
    it("ignores lookalike host containing supported host name", () => {
        expect(parseRepoSlug("https://notgithub.com/owner/repo")).toBeNull();
    });

    it("accepts www subdomain", () => {
        expect(parseRepoSlug("https://www.github.com/owner/repo")).toEqual({
            host: "github.com",
            owner: "owner",
            repo: "repo",
        });
    });
});
