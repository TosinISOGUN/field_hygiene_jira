# Type-Mismatch Severity

## Goal
Collisions where the colliding fields have different underlying types (e.g. one "Story
Points" is a Number field, another is Short text) are flagged distinctly from same-type
collisions — because a type mismatch is the dangerous case: automations and reports can
silently pull from the wrong field with no error. Same-type collisions (the common "someone
retyped it" case) are unaffected in meaning, just visually de-prioritized below the
higher-severity ones.

## Context read
- `products/fieldwatch/CLAUDE.md` — "Pivot — 2026-07-28" (this is item 3 of the four approved
  expansion items, called out there as the smallest lift: "Zero new API calls, just
  re-reading data the resolver already fetches"); Data model section (`Collision` shape);
  "Which tool owns which job" table (grouping/collision detection is the resolver's job, the
  UI does no filtering/matching logic).
- `products/fieldwatch/src/resolvers/index.js` — current `groupCollisions()`, which already
  captures `field.schema?.type` per field in the group but doesn't compare across the group.
- `products/fieldwatch/src/frontend/index.jsx` — current results view, renders
  `result.collisions` in resolver-return order with no severity distinction.

## Assumptions
- "Type mismatch" means the group's fields don't all share the same `type` string
  (`field.schema.type`, e.g. `"string"` vs `"number"`) — a simple set-size check, not a
  judgment about which type is "correct." Fieldwatch still never says which field is right,
  consistent with the existing "no original field" rule.
- Mismatched groups sort to the top of the results list, above same-type groups. Within each
  bucket, existing order (resolver's Map iteration order, effectively fetch order) is
  preserved — no new sort key beyond the severity split.
- No change to the bar chart. Scope stays to the severity flag and its visual treatment in
  the per-group cards; the chart already shows group size, which is orthogonal to type
  mismatch. Keeping this out avoids scope creep on what's meant to be the smallest of the
  four approved items.
- No new resolver function, no new scope, no new dependency.

## Files to change
- `products/fieldwatch/src/resolvers/index.js` — EDIT: `groupCollisions()` computes and
  includes `hasTypeMismatch: boolean` on each `Collision`.
- `products/fieldwatch/src/frontend/index.jsx` — EDIT: sort collisions (mismatched first),
  render a warning `Lozenge` on any collision card where `hasTypeMismatch` is true.
- `products/fieldwatch/CLAUDE.md` — EDIT: update the `Collision` shape in the Data model
  section to include `hasTypeMismatch`.

## What this builds
1. In `groupCollisions()`, after building `groupFields` for a normalized name, compute
   `hasTypeMismatch = new Set(groupFields.map((f) => f.type)).size > 1`. Include it on the
   pushed `collisions` entry: `{ normalizedName, fields: groupFields, hasTypeMismatch }`.
2. In the frontend, before rendering, sort `result.collisions` with a stable sort that puts
   `hasTypeMismatch: true` groups first (`.map((c, i) => [c, i]).sort(...)` or equivalent
   stable approach — plain `.sort()` on booleans is stable in modern V8, but write it
   explicitly rather than relying on that).
3. On each collision's `Box` card, when `hasTypeMismatch` is true, render a
   `<Lozenge appearance="removed">Type mismatch</Lozenge>` next to the group's `Heading`
   (`removed` is UI Kit's red/danger appearance — reused here for severity, not deletion,
   since there's no dedicated "warning-red" appearance beyond what Lozenge offers).
4. `collisionRows()` / the `DynamicTable` inside each card is unchanged — the mismatch is a
   property of the group, not of an individual field row (each row already shows its own
   `type` via the existing `Lozenge` in the Type column, which is how the mismatch becomes
   visible at the field level too).

## Security
No change. Same resolver function, same scope, no new API calls, nothing stored, nothing
logged beyond the existing operational-error line.

## Done when
- On the dev site, a collision group with two different field types (create one manually,
  e.g. rename a Number field and a Short-text field to the same name) shows a red "Type
  mismatch" Lozenge on its card and appears above same-type collision groups in the list.
- The existing "actual end" test collision (if still same-type) shows no mismatch badge and
  sorts below any mismatched group.
- `forge lint` passes.

## Checks
- `forge lint` passes.
- `forge deploy -e development` succeeds (no new scopes, no reinstall needed).

## Verification
1. In Jira, temporarily rename two custom fields of different types (e.g. a Number field and
   a Short text field) to the same name, to create a real type-mismatch collision alongside
   the existing "actual end" one.
2. `forge deploy -e development`.
3. Reload the Field Hygiene admin page in `isogun21.atlassian.net`.
4. Confirm: the new mismatched group shows a red "Type mismatch" Lozenge and appears above
   the "actual end" group in the list; "actual end" (same-type) shows no badge.
5. Rename the test fields back to their original names afterward.
