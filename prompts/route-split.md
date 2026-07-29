# Multi-page route split

## Goal
Field Hygiene stops being one long scroll of stacked sections and becomes a small app with
real pages: an Overview landing route plus one route each for Duplicates, Cleanup (unused +
missing descriptions), Field limits, and Trends, with a persistent top nav and browser
back/forward that actually works.

## Context read
`src/frontend/index.jsx` (current single-`Stack` layout), `CLAUDE.md` ("One `jira:adminPage`.
One screen." — being revised by this prompt, not violated: still one manifest module, one
Forge page, just internal routing within it). Checked current Forge docs directly for the
`Router` API before drafting this (not assumed from memory):

- `Router`, `Route` import from **`@forge/react/router`** (a subpath import, distinct from the
  main `@forge/react` import already used for every other component).
- `useNavigate()`, `useLocation()`, `useParams()` are the supported hooks. Not needed here:
  `useParams()` (no dynamic segments), `useLocation()` is needed for active-tab highlighting.
- **This is a Preview feature per Atlassian's own docs** — shorter deprecation/change windows
  than stable APIs apply. Flagging again here since it's the one real risk in this prompt;
  not a reason not to build it, just something to know if a future Forge release changes its
  shape.
- No built-in "active route" styling — nav highlighting is hand-rolled by comparing
  `useLocation()`'s path against each nav item, same kind of manual state comparison already
  used elsewhere in this file (e.g. `isScanning`, `isExportOpen`).

## Assumptions
- Manifest is untouched — still one `jira:adminPage` module, no new module, no scope change.
  Multiple *separate* `jira:adminPage` modules were checked and ruled out (only one can be a
  site's main admin nav entry; extra ones are restricted to `useAsConfig`/`useAsGetStarted`
  roles, not general content pages) — `Router` inside the existing single module is the only
  fit for what's being asked.
- Loading and error states stay exactly as they render today (outside the router entirely —
  there is nothing to route to until the scan actually completes or fails).
- Rescan and Export stay global — both act on the whole scan regardless of which route the
  admin is on, so they live in a persistent header above the routed content, not per-route.
- Route paths: `/` (Overview), `/duplicates`, `/cleanup`, `/limits`, `/trends`.

## Files to change
- `src/frontend/index.jsx` — restructure the post-load render into a persistent header
  (rescan, export toggle/panel, nav tabs) plus a `Router` with five `Route`s. No other files
  change; no manifest change.

## What this builds
- **Header** (unchanged data, new position): `rescanButton`, `exportButton`, `exportPanel`
  exactly as they exist today, now rendered once above the `Router` instead of duplicated
  between the empty-state and results branches.
- **Nav tabs**: five buttons (Overview, Duplicates, Cleanup, Field limits, Trends), each
  calling `useNavigate()` on click; active tab determined by comparing `useLocation().pathname`
  to the tab's path.
- **`/` Overview route**: a summary digest, not a re-render of everything — counts for each
  category (`X duplicate groups`, `Y possible duplicates`, `Z unused fields`, `W missing
  descriptions`) plus a "needs attention" callout listing anything actually severe right now
  (type-mismatch collisions, guardrail rows at or above the existing 0.8 near-limit ratio), so
  an admin gets the "should I worry" answer in one glance before drilling into a specific page.
  If nothing needs attention, the existing "No issues found" `EmptyState` renders here instead.
- **`/duplicates` route**: today's "Duplicate names found" section (bar chart included) plus
  "Possible duplicates" — unchanged content, just moved.
- **`/cleanup` route**: today's "Unused fields" and "Missing descriptions" sections —
  unchanged content, just moved and given a shared route since both are "fields worth a look"
  in the same spirit.
- **`/limits` route**: today's guardrail section — unchanged content, moved.
- **`/trends` route**: today's Trends section — unchanged content, moved. The existing
  independent `getFieldTrends` fetch (separate `useEffect`, unrelated to rescan) is untouched.
- Each route keeps its own existing empty-case handling (e.g. "no duplicates" renders inline
  on `/duplicates` if both arrays are empty) rather than hiding the whole route — an admin who
  navigates to Duplicates should see "you're clean here," not a blank page.

## Security
No scope change, no new dependency (`Router`/`Route` ship inside the already-installed
`@forge/react`, just a different subpath import), no storage, no new API call. Purely a
frontend restructuring.

## Done when
- Navigating between all five tabs updates the visible content and the tab highlighting, with
  no data refetch (the existing `result`/`trends` state is reused, not re-invoked per route).
- Browser/Jira-panel back and forward navigation moves between the five routes correctly.
- Rescan and Export still work identically regardless of which route is active when clicked.
- The Overview route correctly reflects real "needs attention" signals against a dev-site
  scan that has at least one type-mismatch collision and/or a near-limit guardrail row.
- `forge lint` passes.

## Checks
`forge lint`

## Verification
1. `forge deploy -e development`, open Field Hygiene, confirm the Overview route loads first
   with a summary digest (not the old full stacked view).
2. Click each of the four other tabs, confirm each shows the same content that used to live in
   that section on the old single page, and that the active tab visibly highlights correctly.
3. Use the browser back button after navigating through a couple of tabs, confirm it steps
   back through the route history correctly.
4. Click Rescan from a non-Overview route, confirm the whole app's data refreshes and you stay
   on the same route. Click Export from a non-Overview route, confirm the panel still shows
   the full report across all sections, not just the current route's section.
