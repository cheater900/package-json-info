# Intent

This file explains why the project exists, who it is for, and which
principles guide its design. [FEATURES.md](FEATURES.md) lists what the app
does. [DEVELOPMENT.md](DEVELOPMENT.md) explains how the code is built.

## Problem

A `package.json` names its dependencies but says nothing about their
health. To judge a dependency, a developer opens npm, then the repository,
then the issue tracker, then an advisory database, one package at a time.
For a project with fifty dependencies, that takes an afternoon, so it
rarely happens.

## Purpose

Give one table that answers "how healthy and active is each dependency?"
for any `package.json`, in the time it takes to paste it. The table should
support these decisions:

- Which dependencies are stale, deprecated, or abandoned.
- Which ones carry known vulnerabilities or a license worth reviewing.
- Which ones are heavy for what they do.
- Where to look next. The user can drill into a dependency's own
  `package.json` or browse its published source.

## Audience

Developers who review, audit, or inherit a JavaScript project. Typical
moments are before a dependency upgrade, during a code review that adds a
package, or when someone takes over an unfamiliar codebase.

## Principles

- **Browser only.** The app is a static page that calls public APIs
  directly. It has no backend, no accounts, and stores nothing on a server.
  The `package.json` a user loads never leaves their browser, except for
  the package names sent to the public lookup services.
- **A partial row beats a failed row.** Each column comes from a separate
  service. When one service fails or has no data, that cell shows "-" and
  the rest of the row still renders.
- **Respect rate limits.** The app never fetches data for hidden columns.
  Lookups are shared between rows that use the same package or repository.
  Failed lookups are retried instead of being cached as "no data".
- **Treat third-party data as untrusted.** Registry metadata, repository
  URLs and tarballs come from package authors. The app validates them
  before they become links, API paths or downloads.
- **Fail visibly.** Every failed load tells the user what went wrong, in
  words they can act on.
- **Stay small.** The app uses native browser features (fetch, Compression
  Streams, localStorage) and few dependencies.

## Non-goals

- **Not a package manager.** The app does not install packages or edit the
  `package.json`. It also does not fully resolve semver ranges. A range is
  read as its lowest version, which is good enough for a health overview.
- **Not a security scanner.** The vulnerability count is a pointer to look
  closer. It does not replace `npm audit` or a dedicated scanner.
- **Not a hosted service.** The app has no server of its own. It can be
  deployed as a public static site: the bundle carries no token, and each
  user enters their own GitHub token, kept encrypted in their browser.

## Success

The project succeeds when a developer can load an unfamiliar
`package.json` and, within a minute, name the dependencies that need
attention and say why.
