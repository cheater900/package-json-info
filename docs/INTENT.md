# Intent

Why project exists, who it serves, which principles guide design.
[FEATURES.md](FEATURES.md) lists what app does.
[DEVELOPMENT.md](DEVELOPMENT.md) explains how code gets built.

## Problem

`package.json` names dependencies but says nothing about their health. To
judge one dependency, developer opens npm, then repository, then issue
tracker, then advisory database, one package at a time. Project with fifty
dependencies takes afternoon, so check rarely happens.

## Purpose

One table answers "how healthy and active is each dependency?" for any
`package.json`, in time it takes to paste it. Table supports these
decisions:

- Which dependencies are stale, deprecated or abandoned.
- Which carry known vulnerabilities or license worth review.
- Which are heavy for what they do.
- Where to look next. User drills into dependency's own `package.json` or
  browses its published source.

## Audience

Developers who review, audit or inherit JavaScript project. Typical
moments: before dependency upgrade, during code review adding package, or
when taking over unfamiliar codebase.

## Principles

- **Browser only.** App is static page calling public APIs directly. No
  backend, no accounts, nothing stored on server. Loaded `package.json`
  never leaves browser, except package names sent to public lookup
  services.
- **Partial row beats failed row.** Each column comes from separate
  service. Service fails or has no data -> that cell shows "-", rest of row
  still renders.
- **Respect rate limits.** App never fetches data for hidden columns. Rows
  using same package or repository share lookups. Failed lookups get
  retried, not cached as "no data".
- **Treat third-party data as untrusted.** Registry metadata, repository
  URLs and tarballs come from package authors. App validates them before
  they become links, API paths or downloads.
- **Fail visibly.** Every failed load tells user what went wrong, in words
  they can act on.
- **Stay small.** App uses native browser features (fetch, Compression
  Streams, localStorage) and few dependencies.

## Non-goals

- **Not package manager.** App does not install packages or edit
  `package.json`. It does not fully resolve semver ranges either. Range
  reads as its lowest version, good enough for health overview.
- **Not security scanner.** Vulnerability count is pointer to look closer.
  It does not replace `npm audit` or dedicated scanner.
- **Not hosted service.** App has no server of own. Deploy as public static
  site works: bundle carries no token, each user enters own GitHub token,
  kept encrypted in their browser.

## Success

Project succeeds when developer loads unfamiliar `package.json` and,
within one minute, names dependencies needing attention and says why.
