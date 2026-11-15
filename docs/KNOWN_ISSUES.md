# Known issues

Issues left as is, each with reason. May never get fixed. Gaps worth
fixing live in [NOTES.md](NOTES.md).

## Security

- **Proxy may be `http:`.** Request URLs then reach proxy in cleartext.
  Allowed so localhost proxy works.
- **Proxy fetches any URL given.** Crafted `?inputUrl=` link or registry
  `dist.tarball` URL makes user's proxy fetch that URL; response goes only
  to that user. Comes with having proxy at all.
- **Share link fetches on open.** `?step=url:` link makes browser (or
  proxy) fetch that URL without click; its dependency steps query npm.
  Needed for link to reopen view. Step count and length are capped; only
  http(s) URLs pass.
- **Stored lookups are not encrypted.** With GitHub token, star and issue
  counts of private repos land in IndexedDB as plain values until token
  purge clears them. Token itself never gets stored there.
- **History entries keep rows fetched with purged token.** Star and issue
  counts of private repos stay in memory and show again on back navigation
  until column or proxy change refetches. Memory only, gone on reload.
  Refetch on every purge would spend quota for little gain.
- **Share link carries entered URL verbatim.** Raw URL with secret query
  (`?token=`) lands in address bar and in shared links. Step needs URL to
  reload it; `?inputUrl=` already mirrors it.
- **Proxy prefix without trailing `/`** (`https://p.example` + target)
  builds broken host such as `p.examplehttps`. Requests fail; no real TLD
  matches.
- **Dev-only `npm audit` findings**: moderate advisories in
  `@vue/test-utils` -> js-beautify -> editorconfig/minimatch/glob chain.
  Not in bundle. `npm audit fix --force` downgrades `@vue/test-utils`;
  wait for upstream fix or add `overrides`.
- **Existing CLI cache dir keeps its permissions.** Owner and mode are not
  checked; matters only when `XDG_CACHE_HOME` points at shared location,
  which is user's own config.
- **CLI `--timeout` + `--concurrency` warnings skip terminal
  sanitizer.** Core prints them with `console.warn`; input is user's own
  argv or env.

## Reliability

- **Filter age cut-offs freeze** at last table recompute (`new Date()` in
  computed). Drift equals session length; negligible.
- **"Major version behind" filter reads raw `version`**, while
  `isOutdated` reads resolved alias range. Differs only for odd npm alias
  names.
- **Late token load can purge newer token.** Needs all three: IndexedDB
  hangs past `TOKEN_LOAD_TIMEOUT_MS`, token gets saved meanwhile, late
  decrypt then fails. Save waits behind same stuck IndexedDB, so very
  unlikely.
- **Network badge batch past 1000 requests** can reset early when cap
  trims still-pending request. Badge just hides sooner. Fix needs pending
  counter that survives trims; rare, timeouts settle requests anyway.
- **Network badge skips late body failure from previous batch.** Download
  breaking off after new batch started counts only in network logs modal.
- **Malformed tarball with both file `a` and directory `a/...`** gives
  duplicate Vue keys in file tree. Cosmetic.
- **`URL.canParse`** needs Safari 17+.
- **Brace sets in workspace patterns** (`packages/{a,b}`) stay unexpanded,
  so those workspaces are not listed. Rare in practice.
- **`pnpm-workspace.yaml`** goes through small line parser taking only
  top-level `packages` list. Anchors, multi-document files and `catalog:`
  entries are ignored. Full YAML parser not worth dependency.
- **Health score varies with visible columns.** Issue ratio and
  vulnerabilities count only while their columns show, so same package can
  score differently. Always fetching them would spend GitHub search quota.
  Vulnerability count covers every version, not declared one.
- **Share link stores ranges**, not resolved versions. Workspace steps
  follow repo's current branch. Old link can open newer data.
- **Fallback store keeps whole registry documents** and never evicts.
  Popular packages take several MB each. See cleanup in
  [IDEA.md](IDEA.md).
- **Back or Forward during share link replay** does not stop replay. Next
  replayed step loads on top of picked entry, drops forward history. Only
  during first seconds after opening link.
- **Rapid navigation can hit `replaceState` limit.** Some browsers throw
  past about 100 calls in short window. Share link sync then logs error;
  address bar lags until next navigation. Each sync is one user
  navigation, so only sustained fast clicking hits it.
- **`workspace:` dependency ranges** (`workspace:*`) get looked up on npm
  by package name. Private workspace package shows empty row.
- **Blob and tree URLs only on GitHub.** GitLab `/-/blob/` and Codeberg
  `/src/branch/` URLs still load root `package.json` from `main` or
  `master`.
- **Deep GitHub blob or tree URL lists no workspaces**, nor does root URL
  whose ref holds `/`. `tree/main/packages/a` can be branch
  `main/packages/a` or folder `packages/a` on `main`. Raw host resolves
  file, but workspace tree needs ref alone.
- **PDF export shows `?` for characters outside Latin-1**, such as license
  warning `⚠` or CJK text. jsPDF built-in fonts cover WinAnsi only.
  Embedding Unicode font would add hundreds of KB.
- **Export ignores table sorting.** Sort state lives in each table; rows
  export in `package.json` order.
- **CSV cells starting with `-` plus text** (missing license with its
  `⚠`, shown as `- ⚠`) export as `'- ⚠`. `'` stops spreadsheets running
  untrusted registry text as formula.
- **PDF export of big table freezes page** until file is ready. jsPDF
  renders on main thread.
- **Export libraries load with app.** jsPDF, jspdf-autotable and
  write-excel-file sit in main chunk, roughly doubling it (about 160 KB
  more gzip). Code style rules out dynamic `import()`.

- **CLI export write is not atomic.** Crash mid-write can leave truncated
  file. Tmp file + rename would break `--output /dev/stdout`.
- **Killed CLI can leave cache tmp file.** Cleanup would need cache sweep;
  impact low.
- **CLI cache needs home dir.** `homedir()` throws when `HOME` and
  `XDG_CACHE_HOME` are unset and user has no passwd entry (rare
  containers). Run with `--no-cache` there.
- **CLI exits 0 with failed rows.** Lookup errors show in table cells,
  as in web app; exit code reports only load, parse or write failure.
