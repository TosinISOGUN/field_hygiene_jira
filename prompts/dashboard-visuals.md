# Fieldwatch — Dashboard-Style Results Visuals

## Goal
The results view (when collisions exist) reads as a real dashboard, not just a list: an
at-a-glance affected-fields ratio and a chart showing which duplicate names are worst (most
colliding fields), sitting above the existing per-group detail tables. No new data, no storage
— purely a richer presentation of what the resolver already returns.

## Context read
- `products/fieldwatch/CLAUDE.md` — "What this is NOT" (no dashboards/charts as a *category*
  exclusion — this prompt is the owner's deliberate, informed exception, made explicitly
  knowing the tradeoff, not a silent scope drift); "stores nothing" brand promise (untouched by
  this prompt — no storage added, confirmed in the conversation this exception does **not**
  extend to historical/trend data).
- `products/fieldwatch/src/frontend/index.jsx` — current results view (Badge count, per-group
  `Box` + `DynamicTable`), which this prompt adds to, not replaces.
- developer.atlassian.com — `ProgressBar`, `BarChart` component references fetched this
  session (exact prop shapes below).

## Assumptions
- **Two visuals, not more:** a `ProgressBar` (fields affected / fields scanned) and a
  `BarChart` (one bar per collision group, height = field count in that group). Each conveys
  different information — ratio vs. per-group severity — rather than the same number restated
  three ways. `DonutChart` (type-composition breakdown) was considered and deliberately left
  out for v1 to avoid clutter; easy to add later if wanted.
- Charts render **only in the results state** (`collisions.length > 0`). The loading, error,
  and empty states are unchanged — there's nothing meaningful to chart when the site is clean.
- `BarChart`'s `xAccessor` value per group is the group's existing representative label (first
  field's real name) — same value already used as that group's `Heading`, so the chart and the
  detail table below it visually agree.
- No resolver change. `affectedFieldCount` (already computed client-side for the summary line)
  and `result.collisions` are the only inputs; both already exist in the frontend from the
  previous prompt.

## Files to change
- `products/fieldwatch/src/frontend/index.jsx` — EDIT: add the two chart components to the
  results-state render, above the existing per-group `Box`/`DynamicTable` list.

## What this builds
1. **`ProgressBar`:** `value={affectedFieldCount / result.totalCustomFields}`, `ariaLabel`
   stating the ratio in words (e.g. "3 of 14 custom fields affected"), placed directly under
   the existing summary heading/Badge/text.
2. **`BarChart`:** one entry per collision group —
   `{ xAxis: collision.fields[0].name, value: collision.fields.length }` — with `xAccessor`,
   `yAccessor` set accordingly, `title="Fields per duplicate name"`. Placed between the
   `ProgressBar` and the existing per-group detail cards.
3. Existing per-group `Box` + `Heading` + `DynamicTable` list is unchanged below the chart —
   the chart is an overview, the cards below remain the actionable detail.
4. Still no business logic added to the frontend beyond simple display-shaping (computing
   chart-ready arrays from data the resolver already returns) — no new filtering, sorting that
   changes meaning, or re-grouping.

## Security
- No change. No new scope, no storage, no egress, no new resolver function. Purely
  presentational.

## Done when
- On the dev site (with the standing "actual end" test collision), the results view shows a
  progress bar and a bar chart above the existing detail cards, both reflecting real numbers
  that match the detail tables below them.
- The empty/error/loading states are visually unchanged from the previous prompt.
- `forge lint` passes.

## Checks
- `forge lint` passes.
- `forge deploy -e development` succeeds (no new scopes, no reinstall needed).

## Verification
1. `forge deploy -e development`.
2. Open `isogun21.atlassian.net` → Settings → Apps → Fieldwatch.
3. Confirm the progress bar and bar chart appear above the existing per-group tables, and the
   numbers they show match what's in the tables below (e.g. the bar chart's bar for "actual
   end" should read 3, matching the 3-row table for that group).
