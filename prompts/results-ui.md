# Fieldwatch — Results UI

## Goal
The Fieldwatch admin page shows a real, legible interface instead of the temporary raw-JSON
harness: a loading state while the scan runs, a clear empty state when the site is clean, an
error state the admin can understand, and — when duplicates exist — each collision group shown
as its own labeled table of the real, colliding fields. This is the last prompt for v1; after
this, Fieldwatch is feature-complete per `CLAUDE.md`.

## Context read
- `products/fieldwatch/CLAUDE.md` — "What this is" (one screen, read-only), "Which tool owns
  which job" (rendering is UI Kit's job only, no business logic in the frontend), Code quality
  (`DynamicTable`, not `Table`; UI Kit only, no `react` imports beyond what's already used).
- `products/fieldwatch/src/resolvers/index.js` — the real, verified return shape:
  `{ collisions: Collision[], totalCustomFields: number, error: string | null }`, where
  `Collision = { normalizedName, fields: Field[] }` and `Field = { id, name, type }`.
- developer.atlassian.com — `DynamicTable`, `EmptyState`, `Box`, `Heading` component
  references fetched this session (exact props below), plus confirmation `Spinner` and
  `Lozenge` exist in `@forge/react`.

## Design direction — owner priority: polished, professional, "industry standard" feel

UI Kit (native) is a real constraint: no custom CSS, no arbitrary layout, no third-party
component libraries (`CLAUDE.md` Code quality rules). "Polished" here means *using the right
UI Kit components well*, not styling around the constraint:

- **Empty state:** Atlassian's own `EmptyState` component (`header` + `description`), not a
  plain `SectionMessage` — this is literally the same polished empty-state pattern used across
  real Atlassian products, not a homemade approximation.
- **Field type:** rendered as a `Lozenge` pill instead of plain text — instant visual scan.
- **Collision count:** a `Badge` next to the results heading, not just prose.
- **Group separation:** each collision group sits in a `Box` with a subtle background tint
  (`color.background.neutral`) and token-based padding — visually distinct "cards" instead of
  tables stacked directly on top of each other with no separation.
- **Spacing:** `Stack`/`Inline` with space tokens throughout, not relying on component default
  margins — this is what actually reads as "designed" vs "default."
- **Loading:** `Spinner` + `Text`, not just text alone.

## Assumptions
- **Layout: one Heading + one DynamicTable per collision group**, not a single flat table with
  a "group" column. With a duplicate-finder tool, the realistic case is zero to a handful of
  groups — separate labeled tables are more scannable than a merged table the admin has to
  visually re-group themselves.
- Each group's heading uses the **first field's real name** as the representative label (e.g.
  "Actual end — 2 fields"), never the normalized key — matches the hard rule that the
  normalized form is for matching only, never display.
- Each group's table has three columns: **Name, Type, Field ID.** ID is included because it's
  the fastest way for an admin to find the exact field in Jira's own field admin list if two
  colliding fields look identical at a glance (matching case and spacing).
- Loading state uses plain `Text` ("Scanning fields…"), not `Spinner` — keeps the frontend's
  component surface small; both are already part of `@forge/react`, this is a style choice,
  not a dependency question.
- Error and empty states use `SectionMessage` (`appearance="error"` / default) — a standard UI
  Kit component, no new dependency.

## Files to change
- `products/fieldwatch/src/frontend/index.jsx` — EDIT (full rewrite): replaces the temporary
  raw-JSON harness from the resolver prompt with the real UI described below.

## What this builds
1. On mount, calls `invoke('getFieldCollisions')` — unchanged from the harness.
2. **Loading:** `Stack` (centered) with a `Spinner` and `<Text>Scanning fields…</Text>`.
   Nothing else renders in this state.
3. **Error:** `SectionMessage appearance="error"` with a short title and the resolver's message
   as the body. Nothing else renders in this state.
4. **Empty:** `result.error === null && collisions.length === 0` → `EmptyState` with
   `header="No duplicate fields found"` and
   `description={\`Checked ${totalCustomFields} custom fields — every name is unique.\`}`. No
   `primaryAction` — there's nothing to click; Fieldwatch is read-only.
5. **Results:** `collisions.length > 0` →
   - Top line: `Inline` with a `Heading` ("Duplicate fields found") and a `Badge` showing
     `collisions.length`.
   - For each collision group, a `Box` (`backgroundColor="color.background.neutral"`,
     token-based `padding`) containing a `Stack`: a small `Heading` using the group's first
     field's real name as the label, then a `DynamicTable` with three columns — Name, Type
     (each cell a `Lozenge`), Field ID — one row per field in the group.
   - `Stack` with a space token between each group's `Box` so groups read as separate cards,
     not a continuous block.
6. No business logic lives in the frontend — no filtering, sorting-that-changes-data, or
   re-grouping. The component only maps the resolver's already-correct output to UI Kit
   components, matching the "resolver→UI boundary" hard rule.

## Security
- No change from the resolver prompt. No new scope, no storage, no egress. The frontend still
  only calls the one existing resolver function with no arguments.

## Done when
- Loading state shows briefly, then resolves to exactly one of: error, empty, or results —
  never more than one state visible at once.
- On the real dev site (currently clean), reloading Fieldwatch shows the empty-state message
  with the correct field count, not a blank screen or the old JSON dump.
- Temporarily re-creating a collision (as verified manually in the resolver prompt) shows a
  correctly labeled table with the real field names, not the normalized key.
- `forge lint` passes.

## Checks
- `forge lint` passes.
- `forge deploy -e development` succeeds (no new scopes, so no reinstall needed).

## Verification
1. `forge deploy -e development`.
2. Open `isogun21.atlassian.net` → Settings → Apps → Fieldwatch.
3. Confirm the empty-state message appears (site is currently clean) with a real field count,
   not raw JSON.
4. Optional but recommended: repeat the earlier manual test — rename a field to collide with
   another, reload, confirm a labeled table appears with both real names, then rename it back.
