# Package JSON Info

A web app that reads a `package.json` and produces a rich, browsable summary
table of its dependencies and devDependencies.

## Goal

Let a user bring in a `package.json` from wherever they have it, and get back
a table that tells them, at a glance, how healthy and active every dependency
is, without opening npm, GitHub, and changelogs one tab at a time.

Runs fully in the browser. Users add their own GitHub token in the settings
menu; it stays encrypted in their browser, so a public static deploy is safe.

## Documentation

- [Intent](docs/INTENT.md): purpose, audience, design principles, and non-goals.
- [Features](docs/FEATURES.md): input methods, table columns, and other implemented features.
- [Development](docs/DEVELOPMENT.md): code layout, stack, configuration, and how to run, build, and test.
- [Roadmap](docs/ROADMAP.md): planned work.
- [Ideas](docs/IDEA.md): features worth trying, not planned.
- [Notes](docs/NOTES.md): open gaps and decisions, not planned.
- [Known issues](docs/KNOWN_ISSUES.md): issues left as they are, with reasons.
- [Changelog](docs/CHANGELOG.md): changes by month, condensed from git history.
