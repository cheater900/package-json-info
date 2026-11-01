# Changelog

Changes derived from git history, newest first, grouped by date.

## 2026-11-04

- Replace modal and column comments with ModalContent type and names, share JSON_INDENT constant
- Move OSV page cap and config int limit into constants
- Rename storage key, tar byte and fetch column group constants to shared-prefix names
- Replace always-true isCentered check with static class, name Name column key
- Drop unused per-call githubToken option from package fetch; headers always come from config
- Move isRepoHostUrl to repoUrl utils, build GitLab/Codeberg raw URLs from repoWebUrl
- Move SourceTreeRef and DependencyRow to types so domain types don't import from api layer
- Split planned work out of FEATURES into ROADMAP and IDEA, backfill CHANGELOG from git log
- Reject config ints above 2^31-1 so huge timeout can't overflow timer and abort every fetch
- Clear previous entry's rows on fetch start so empty list doesn't show stale deps
- Stream tarball download into gunzip so oversized or endless body can't exhaust memory
- Cap OSV paging, stop on any repeated token so cycles can't loop forever
- Ignore .env files so build-time GitHub token can't be committed
- Parse repo slug from URL path only so query or hash can't swap repo
- Bound PAX "=" search to its record to stop quadratic tar parsing
- Anchor semver regex at digit-run start to stop quadratic scan
- Normalize tree paths by split to stop slash-run ReDoS in tarball paths

## 2026-10-31

- Reword docs: drop spaced-hyphen dashes and filler phrasing
- Add INTENT doc with purpose, principles and non-goals
- Type history entry rows as PackageInfo or PackageError
- Share settle helper for load-then-check-staleness flows
- Type composable parameters and drop .ts import extensions
- Name scope marker offset and kilobyte decimals
- Share HTTP status constants and response builders across tests
- Share first-found URL probing between tag and branch lookups
- Move pinnedVersionOf to semver utils
- Move tarball size constants to constants and share byte concat util
- Fetch npm tarball only from http(s) URLs
- Cap unpacked tarball size to stop gzip bombs exhausting memory
- Bump vue, oxfmt and transitive deps past known advisories
- Report undecodable tarball as corrupt instead of blank error
- Read GNU long-name tar entries for paths over 100 chars
- Show notice when GitHub lists source tree only in part
- Follow OSV result pages for full vulnerability count
- Restrict repo slug owner and repo to host name characters
- Resolve version data and date from leading semver of ranges

## 2026-10-28

- Name tarball, memo and submodule checks instead of commenting
- Reuse parseRepoSlug for repo URL input instead of own regex
- Shorten new test names
- Evict only own failed request from async memo cache
- Omit submodule entries from GitHub source tree
- Fail on truncated or corrupt tarball instead of partial tree
- Reject URL input without http(s) scheme
- Accept .git suffix, query and host case in repo URLs
- Look up GitHub release tag by exact ref, not prefix match

## 2026-10-27

- Match repo host only as whole hostname
- Ignore stale results in source tree browser
- Parse PAX tar records as bytes for non-ASCII paths
- Allow reselecting same file, reject blank URL
- Debounce address bar sync of URL input
- Apply only most recent package.json load
- Fix duplicate tree nodes, invalid dates, stale error banner
- Show error on failed package rows and refetch them
- Apply dependency fetch only to entry that started it
- Only link http(s) source URLs from npm data
- Resolve npm alias specs to real registry package
- Look up GitHub release tag by pinned version, not raw range
- Stop caching rate limits and outages as missing data
- Fall back per field when optional lookup fails
- Abort network requests after configurable timeout
- Validate numeric env settings at startup
- Apply code style rules to src and tests, shorten test titles
- Move user-facing text into i18n message catalog
- Split network code into api layer, dedupe components and tests

## 2026-10-15

- Validate loaded package.json with a zod schema and derive its types
- Replace non-ASCII em dashes in README with hyphens
- Shorten test titles to terse present-tense descriptions
- Brace all conditionals and prefer early returns over nesting and else
- Sort CSS properties alphabetically and space rules by one blank line
- Rename CSS classes to BEM block__element--modifier form

## 2026-09-12

- Widen the search input so its placeholder fits
- Move search/shrink-columns row below the package name heading
- Move the status row inside the table
- Give the Name cell its own arrow cursor, row cursor to pointer
- Open the package summary card by clicking a row
- Add PackageSummaryCard for inspecting one dependency in the modal
- Replace Actions column with a clickable Name cell
- Exclude version columns from cell truncation
- Truncate long text cells with click-to-expand
- Use SVG upload icon instead of arrow glyph
- Center every column except Name
- Move expand/source-tree modal ownership from DependenciesTable to App
- Add a reusable Modal component, drop deps-table Teleport
- Add green border to source tree modal
- Center the loading and empty-dependencies messages
- Add a sharp green grid to the deps table
- Remove the tooltip from the expand/collapse table button
- Expand Deps, Dev Deps, and package.json accordions by default
- Bound the expanded table's proportions to the screen size
- Replace native title tooltips with a reusable Tooltip component
- Add icons to input-method buttons and uppercase all button labels
- Give the UI a retro terminal theme

## 2026-09-10

- Add a browsable Source Code Tree column to the dependencies table
- Give DependenciesTable ownership of its own column knowledge
- Add fullscreen expand modal to the dependencies table
- Split Vue components into separate .vue, .ts, and .css files

## 2026-09-07

- Disable Node's experimental webstorage global in test scripts
- Restore comma-formatted numbers and weekday-free dates lost in merge
- Merge from remote branch

## 2026-09-05

- refact: separation of concerns, extract composables and pure row logic

## 2026-09-06

- Center and uppercase the h1; center Actions column via a centeredColumns prop
- Polish general UI: table density, header weight, sticky search, button/summary padding
- Rework toolbar rows with flex layouts instead of stacked labels
- Format numeric columns with comma-separated thousands
- Drop the weekday from formatted dates in the deps table
- Show a loading row in deps tables while a package.json swap is in flight
- Correct misspelled package name in package.json
- Show current package name above deps tables; rename Load column/button

## 2026-09-05

- Add a preference to shrink table columns by abbreviating their labels
- Replace per-table search boxes with one shared search box
- Restyle table headers: no wrap, plain-text sort trigger, icon on the right

## 2026-09-04

- Add drag-to-reorder table columns
- Lay out the columns panel in a responsive multi-column grid
- Replace hiddenColumns with visibleColumns throughout
- Persist column visibility preferences in localStorage
- Sync the URL input with a ?inputUrl= query param
- Render package.json with vue-json-pretty instead of raw <pre> text

## 2026-08-31

- Export and unit-test internal parsing/caching helpers
- Fix unicorn/no-new-array lint finding in fetchPackagesInfo
- Reformat codebase with oxfmt
- Add oxlint and oxfmt
- Move tests into a unified tests/ tree

## 2026-08-30

- Collapse the Columns accordion by default too
- Move History below Columns, hide it until there's more than one entry
- Add a screenshot script for visual review while tweaking the UI
- Collapse Deps and Dev Deps accordions by default
- Consolidate the four inputs into one URL row + two action buttons
- Make Columns, Deps, and Dev Deps collapsible accordions

## 2026-08-29

- UI: remove flex display from columns panel and from input methods
- Mark completed items in the README with checkboxes
- Add a search box to filter the table by package name
- Add history navigation with back/forward buttons
- Add a Load column that drills into a row's own package.json
- Hide third-party-backed columns by default
- Skip network requests entirely for hidden columns
- Add a heavy in-memory cache for package metadata lookups
- Add e2e test for horizontal table scrolling
- Add a column visibility panel with a two-column floor
- Add the nice-to-have data enrichment columns
- Add click-to-sort on the table's numeric/date columns
- Fetch star counts from GitLab and Codeberg, not just GitHub
- Support GitLab and Codeberg in the Git URL input, not just GitHub
- Scope vitest to src/, excluding Playwright's e2e specs
- Add Playwright for headless e2e tests
- Fix invalid table markup and drop needless defineProps import
- Add component tests for DependenciesTable
- Add vitest and unit tests for the npm/GitHub metadata fetcher
- Bump nanoid and postcss to patched versions
- Add closed PR/issue counts and dependency list to the table

## 2026-08-28

- Implement all four package.json input methods, with validation and loading state
- Promote table/input data and UX basics to must-have in README
- Add optional/nice-to-have features section to README
- Document transitive dependency resolution goal in README
- Document project goals in README
- Initial commit
