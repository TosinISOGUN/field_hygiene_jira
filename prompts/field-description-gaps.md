# Field description gaps

## Goal
The results page gains a new section listing custom fields with no description (blank or
whitespace-only) — a second, independent hygiene signal alongside collisions/unused/duplicates,
since undocumented fields are a common source of the same confusion that causes duplicate
fields in the first place ("what does this field even do?").

## Context read
`CLAUDE.md` (Pivot section, Data model, API contracts, Hard rules), `src/resolvers/index.js`
(existing `fetchAllCustomFields`, `findUnusedFields` as the pattern to follow),
`src/frontend/index.jsx` (existing section structure). Verified against the live OpenAPI v3
spec (`jira-openapi-v3.json`, `components.schemas.Field`): `description` is a top-level,
always-present property on the `Field` schema — not gated behind the `expand` query param
(confirmed by checking `/rest/api/3/field/search`'s parameter list directly; `description` is
absent from the `expand` enum, meaning it's returned unconditionally). Also checked `query`
param docs, which mention "case-insensitive partial match with field names **or
descriptions**" — further confirming the field carries a description by default.

## Assumptions
None beyond what's verified above — no new endpoint, no new expand value, no new scope.

## Files to change
- `src/resolvers/index.js` — add `findFieldsMissingDescription()`, call it in
  `resolver.define('getFieldCollisions', ...)`, add `fieldsMissingDescription` to the return
  shape.
- `src/frontend/index.jsx` — new "Missing descriptions" section, same `DynamicTable` pattern as
  Unused fields.
- `CLAUDE.md` — document the new signal in Data model, API contracts (note `description` is
  unconditional), Pivot-adjacent section, and the resolver return-shape docs.

## What this builds
- `findFieldsMissingDescription(fields)`: filters `fields` (the same unlocked custom-field list
  already fetched, no new API call) where `!field.description || field.description.trim() ===
  ''`. Returns `{ id, name, type }[]`, same shape as `UnusedField` minus the `reason`.
- Added to `getFieldCollisions`'s return object as `fieldsMissingDescription: FieldsMissingDescription[]`.
  No new failure mode — if the main field fetch fails, this is empty like every other array in
  that branch; it never has its own error slot, since it's derived from data already in hand.
- Frontend: a "Missing descriptions" `DynamicTable` section (name/type/id columns, same
  `fieldRows()` helper already used elsewhere), shown only when the array is non-empty, folded
  into `hasAnySignal` so the empty state correctly reflects "clean" only when this is also
  empty.
- Trends is **not** touched — this is a point-in-time list like collisions/unused-fields, not
  a fourth tracked count. If daily tracking of this metric is wanted later, that's a separate
  ASK (touches the `Snapshot` shape and `dailySnapshotTrigger`).

## Security
No new scope, no new API call, no storage. Reads a field already present on the existing
`/field/search` response.

## Done when
- A custom field with a blank or whitespace-only description shows up under "Missing
  descriptions" on the results page.
- A field with a real description does not.
- The empty state ("No issues found") only shows when collisions, possible duplicates, unused
  fields, **and** missing-description fields are all empty.

## Checks
`forge lint`

## Verification
1. In the dev site, clear the description on one custom field (Jira admin → custom fields →
   edit description → blank it out).
2. Open Field Hygiene, click Rescan.
3. Confirm that field appears under a new "Missing descriptions" heading.
4. Re-add a description, rescan, confirm it disappears from that section.
