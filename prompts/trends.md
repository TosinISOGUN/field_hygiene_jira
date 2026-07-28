# Trends

## Goal
A daily, automatic snapshot of four headline numbers (total custom fields, duplicate-name
groups, unused fields, possible duplicates) is stored and charted over time, so an admin can
see whether field hygiene is improving or getting worse — the last item from the
2026-07-28 pivot, and the only one that needs storage.

## Context read
- `products/fieldwatch/CLAUDE.md` — "stores nothing" section (already rewritten to scope the
  promise to "Trends stores aggregate counts only, never field content" — this prompt is what
  makes that true, not a new decision); "What this is NOT" (event triggers beyond what Trends
  needs, already pre-approved); Security rules ("asUser() always. Never asApp().").
- Atlassian docs, fetched this session:
  - Scheduled triggers run with **no user context** — `asUser()` cannot work there, only
    `asApp()`. Confirmed directly: "Functions run without user context... you cannot use
    asUser()." This is a real, scoped exception to the app's own security rule, explicitly
    discussed and approved by the owner before this prompt (asApp() only inside the
    scheduled-trigger function, nowhere else).
  - `scheduledTrigger` manifest module: `key`, `function`, `interval`
    (`fiveMinute`/`hour`/`day`/`week`), optional `filter.appIsLicensed`. Starts ~5 minutes
    after deploy, then on the chosen interval.
  - `@forge/kvs`: `kvs.set(key, value)`, `kvs.get(key)`,
    `kvs.query().where('key', WhereConditions.beginsWith(prefix)).getMany()` for prefix
    listing. Needs the **`storage:app`** scope. Free tier is 0.1 GB/month reads and writes
    separately — daily ~200-byte snapshot objects (roughly 30 writes/month, 90 stored records
    max) sit nowhere close to that.
  - `LineChart` (`@forge/react`): object-array data, `xAccessor`/`yAccessor` as string keys,
    `colorAccessor` groups rows into separate lines by a categorical field — same
    "long format" pattern already used for this app's bar chart's `colorAccessor`.
- `products/fieldwatch/src/resolvers/index.js` — `fetchAllCustomFields()`, `groupCollisions()`,
  `findPossibleDuplicates()`, `findUnusedFields()` are reused by the trigger, not duplicated;
  `fetchAllCustomFields()` needs a small signature change (see Assumptions) so the trigger can
  call it with `asApp` instead of the resolver's `asUser`.

## Assumptions
- **Owner-approved exception:** `asApp()` used only inside the new scheduled-trigger
  function's Jira calls. Every other call in this app keeps using `asUser()`, unchanged.
- **Cadence: daily, `interval: day`. Retention: 90 days**, pruned by deleting the exact key
  for the date 91 days ago after each successful write (deterministic single delete, no
  range query needed for pruning) — both owner-approved.
- **Metrics tracked (all four):** `totalCustomFields`, `collisionGroups`
  (`collisions.length`), `unusedFieldsCount`, `possibleDuplicatesCount` — counts only, never
  field names or IDs, matching the rewritten brand-promise scope exactly.
- **Storage key shape:** `snapshot:<YYYY-MM-DD>` (UTC date), value
  `{ date, totalCustomFields, collisionGroups, unusedFieldsCount, possibleDuplicatesCount }`.
  One key per day — simple, and pruning becomes a single deterministic delete rather than a
  query-then-filter operation.
- **`fetchAllCustomFields()` takes the calling identity as a parameter** (`asUser` or `asApp`,
  both are functions from `@forge/api`) instead of hardcoding `asUser()` — the resolver keeps
  passing `asUser`, only the new trigger function passes `asApp`. This is the smallest change
  that reuses existing logic without asApp() leaking into any other code path.
- **`kvs.delete(key)` exists** with that exact name — the fetched docs mentioned deletion
  without showing exact syntax; verify empirically during build, same as every other
  not-fully-documented API this session.
- **Frontend needs at least 2 snapshots to show a chart** — one data point isn't a trend. With
  0 or 1 snapshots, show a "Building history — check back tomorrow" message instead of an
  empty or single-point chart.
- New resolver function `getFieldTrends` (separate from `getFieldCollisions`) reads snapshot
  history for the frontend — a plain KV read, no Jira call, so no `asUser()`/`asApp()`
  question applies to it at all.
- The guardrail-gauge numbers (scheme/team-managed field counts) are **not** part of Trends —
  out of scope per the "all four signals" decision, which named collisions/unused/possible
  -duplicates/total-fields specifically, not the guardrail data.

## Files to change
- `products/fieldwatch/manifest.yml` — EDIT: add `storage:app` scope; add `scheduledTrigger`
  module and its `function` entry.
- `products/fieldwatch/package.json` — EDIT: add `@forge/kvs` dependency.
- `products/fieldwatch/src/resolvers/index.js` — EDIT: `fetchAllCustomFields()` takes an
  identity parameter; add `takeDailySnapshot()` (the trigger handler, exported), add
  `getFieldTrends` resolver function.
- `products/fieldwatch/src/frontend/index.jsx` — EDIT: new "Trends" section, `LineChart` in
  long-format data, "building history" fallback for <2 snapshots.
- `products/fieldwatch/CLAUDE.md` — EDIT: document the new scope, new module, storage shape,
  the asApp() exception's actual landing spot in code, mark pivot item 5 built.

## What this builds
1. `fetchAllCustomFields(identity)` — same logic, `asUser()` replaced with `identity()` at the
   call site; resolver calls `fetchAllCustomFields(asUser)`, trigger calls
   `fetchAllCustomFields(asApp)`.
2. `takeDailySnapshot()` — the scheduled-trigger handler. Fetches fields via `asApp`, filters
   locked fields (same as the resolver), computes `collisions`/`possibleDuplicates`/
   `unusedFields` via the existing functions, writes today's snapshot to
   `kvs.set('snapshot:<today>', {...})`, then deletes the 91-days-ago key if present. Logs an
   operational-fact-only error on failure (same pattern as everywhere else) — a missed
   snapshot day isn't fatal, just a gap in the trend line.
3. `resolver.define('getFieldTrends', ...)` — `kvs.query().where('key',
   WhereConditions.beginsWith('snapshot:')).getMany()`, maps to a sorted-by-date array,
   returns `{ snapshots: Snapshot[] }`.
4. Frontend: `invoke('getFieldTrends')` alongside the existing `getFieldCollisions` call (two
   separate invokes, not combined into one — trend history doesn't need to block or be
   recomputed by the rescan button, since it only changes once a day regardless of how often
   someone rescans). New "Trends" section: if `snapshots.length < 2`, a short message; else a
   `LineChart` built from long-format data (one row per `{date, metric, value}` per snapshot
   per metric), `xAccessor="date"`, `yAccessor="value"`, `colorAccessor="metric"`.
5. Manifest: `scheduledTrigger` module (`interval: day`, `filter.appIsLicensed: true` since
   `licensing.enabled: true` is already set), its own `function` entry pointing at
   `takeDailySnapshot`, `storage:app` added to `permissions.scopes`.

## Security
**New scope: `storage:app`** — required for `@forge/kvs`, automatic ASK (already discussed
and approved as part of the broader "Trends needs storage" decision, restated here as it
lands in `manifest.yml`). **`asApp()` used exactly once**, inside `takeDailySnapshot()` —
every other Jira call in this app still uses `asUser()`. Nothing beyond aggregate counts is
ever stored — no field names, IDs, or content in any KV value. Storage volume is negligible
against the free tier (see Context read).

## Done when
- On the dev site, `manifest.yml` has the new scope and scheduled-trigger module; `forge
  deploy` + `forge install --upgrade` succeed.
- After the trigger has run at least twice (either two real days, or triggered manually for
  testing — see Verification), the Field Hygiene page shows a "Trends" section with a real
  multi-line chart reflecting actual snapshot data.
- Before two snapshots exist, the page shows the "building history" message instead of a
  broken or empty chart.
- `forge lint` passes.

## Checks
- `forge lint` passes.
- `forge deploy -e development` succeeds.
- `forge install --upgrade -e development -p Jira -s isogun21.atlassian.net --confirm-scopes --non-interactive`.

## Verification
1. `forge deploy -e development`, then `forge install --upgrade ...`.
2. Scheduled triggers can't be easily fired on-demand from the CLI for same-day testing — if
   `forge` offers a way to manually invoke a scheduled-trigger function for testing, use it;
   otherwise this may need a day or two of real elapsed time before the chart has enough
   points, which is expected and not a bug. State plainly during the build report which of
   these ended up being true, rather than assuming.
3. Check `forge logs` for the trigger's own log lines confirming a snapshot was written, and
   confirm no `asApp()`-related permission errors.
4. Once 2+ snapshots exist, reload the Field Hygiene page and confirm the Trends chart
   renders with real numbers matching what's in KV storage.
