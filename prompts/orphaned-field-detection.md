# Orphaned-Field Detection

## Goal
Custom fields that aren't attached to any screen (nobody can enter data into them anywhere)
are surfaced as a distinct, honestly-scoped "orphaned fields" section — filling the real gap
in Fieldwatch's original pitch (Site Optimizer's unused-field detection is Premium/Enterprise
-gated) without overclaiming Site Optimizer's fuller "unused for 2 years" bar, which isn't
buildable as a live on-demand scan.

## Context read
- `products/fieldwatch/CLAUDE.md` — "Pivot — 2026-07-28" item 1 (renamed from "unused-field
  detection" to "orphaned," scope decision on `manage:jira-project` vs the 5-scope Beta
  bundle, the "attached to zero screens" vs Site Optimizer's fuller definition tradeoff, all
  already discussed and decided with the owner); "Security rules" (minimum viable scope,
  `asUser()` always); `skills/forge-beta-scopes.md` (test empirically when lint and docs
  disagree — same pattern used for `read:jira-work`).
- Live Jira Cloud OpenAPI v3 spec, fetched and queried directly this session (WebFetch
  couldn't render the docs page reliably, same issue noted for `/field/search` originally):
  confirmed `GET /rest/api/3/field/{fieldId}/screens` — paginated (`PageBeanScreenWithTab`,
  has `total`), requires the *Administer Jira* **global** permission per its own description,
  Current-state scope `manage:jira-project`.
- `products/fieldwatch/src/resolvers/index.js` — current `fetchAllCustomFields()` and
  `getFieldCollisions` resolver, both extended alongside, not replaced.
- `products/fieldwatch/src/frontend/index.jsx` — current results view, which already has one
  conditional section (`possibleDuplicatesSection`) added ad hoc last prompt. This prompt
  generalizes that pattern instead of adding a second one-off special case.

## Assumptions
- **New scope: `manage:jira-project`.** Broad-sounding for what's actually a read-only
  screens lookup, but it's the Current-state scope per the OpenAPI spec — same "prefer
  Current over Beta, verify empirically" call made for `read:jira-work`. This is a real
  automatic-ASK (scope addition) — already surfaced and decided with the owner before this
  prompt was drafted, not silently added.
- **One check per custom field, `maxResults=1`** — we only need `page.total === 0` to know a
  field is orphaned; no need to paginate through every screen it's on. Requests run in
  batches of 10 concurrent calls (`Promise.all` per batch, sequential batches) rather than
  all-at-once, to stay reasonable against Jira's rate limits — an unbatched `Promise.all`
  over every custom field on a large site risks bursting the rate limit in one shot.
- **Orphan check runs against the same `unlockedFields` set** already used for collision
  detection (locked/system fields stay excluded, same rationale as before: the admin can't
  act on a field they can't edit or delete either way).
- **Soft-fail, not hard-fail, on permission errors.** If the calling admin somehow lacks the
  *Administer Jira* global permission (shouldn't happen on an admin-only page, but not
  assumed), the screens check will 403. This must not take down the whole scan — collision
  and fuzzy-duplicate results are still valid and should still render. On failure, orphan
  detection returns `orphanedFields: []` plus a separate `orphanScanError: string | null`
  the UI shows as a small, dismissible-feeling warning, not a full-page error.
- **UI restructure, not just an addition.** The current empty-state gate
  (`result.collisions.length === 0 && !hasPossibleDuplicates`) and the one-off rescan-button
  placement inside two different section headers doesn't scale to a third independent
  section. This prompt replaces that with: one `hasAnySignal` check across all three result
  types for the true empty state, and a single top-level rescan control shown once whenever
  there's any result to show, instead of duplicated per-section logic.

## Files to change
- `products/fieldwatch/manifest.yml` — EDIT: add `manage:jira-project` to `permissions.scopes`.
- `products/fieldwatch/src/resolvers/index.js` — EDIT: add `isFieldOrphaned()`,
  `findOrphanedFields()`; `getFieldCollisions` return shape gains `orphanedFields` and
  `orphanScanError`.
- `products/fieldwatch/src/frontend/index.jsx` — EDIT: generalize the empty-state gate and
  rescan-button placement; add an "Orphaned fields" section; render a warning
  `SectionMessage` if `orphanScanError` is set.
- `products/fieldwatch/CLAUDE.md` — EDIT: document the new scope, the new return shape, and
  mark item 1 of the pivot as built.

## What this builds
1. **`isFieldOrphaned(fieldId)`** — `GET /rest/api/3/field/{fieldId}/screens?maxResults=1`,
   returns `page.total === 0`. Throws on a non-ok response (caught by the caller).
2. **`findOrphanedFields(fields)`** — iterates `fields` in batches of 10, `Promise.all` per
   batch, collects fields where `isFieldOrphaned` is true into
   `{ id, name, type: field.schema?.type }` entries. Any error during the whole pass is
   caught by the resolver (see next point) — not per-field, to keep this function simple.
3. In `getFieldCollisions`, after computing `collisions`, wrap the orphan check in its own
   try/catch, separate from the existing field-fetch try/catch:
   ```
   let orphanedFields = [];
   let orphanScanError = null;
   try {
     orphanedFields = await findOrphanedFields(unlockedFields);
   } catch (err) {
     console.error('getFieldCollisions: orphan scan failed —', err.message);
     orphanScanError = 'Could not check field usage on screens. Other results are still accurate.';
   }
   ```
   Return shape becomes
   `{ collisions, possibleDuplicates, orphanedFields, orphanScanError, totalCustomFields, error }`.
4. Frontend: replace the current two-branch empty-state logic with
   `hasAnySignal = collisions.length > 0 || possibleDuplicates.length > 0 || orphanedFields.length > 0`.
   `EmptyState` only renders when `!hasAnySignal`. When `hasAnySignal`, render (in order):
   a single top bar with a "Field scan results" heading and the rescan button (replacing the
   two embedded button placements from the previous prompt); the existing "Duplicate names
   found" block only if `collisions.length > 0`; the existing "Possible duplicates" block only
   if `possibleDuplicates.length > 0`; a new "Orphaned fields" block only if
   `orphanedFields.length > 0`, a plain `DynamicTable` (Name/Type/Field ID, same `tableHead`)
   with a one-line caption ("Not attached to any screen — nobody can enter data into these.
   Candidates for cleanup, not automatically safe to delete."); and, if `orphanScanError` is
   set, a `SectionMessage appearance="warning"` above the results explaining orphan detection
   specifically didn't run, without hiding collisions/duplicates.

## Security
**New scope: `manage:jira-project`** (Current-state, per the live OpenAPI spec) — this is an
automatic ASK, already raised and decided with the owner before this prompt. Used only for
`GET /rest/api/3/field/{fieldId}/screens`, a read; no write capability is exercised anywhere
in this codebase regardless of what the scope name implies. `asUser()` throughout, consistent
with the rest of the app — the calling admin can never see more than they already could.
Requires reinstall (`forge install --upgrade`) after deploy, same as the earlier
`read:jira-work` scope change.

## Done when
- On the dev site, a custom field with no screens attached (create one via "Create custom
  field" and don't add it to any screen, or find an existing one) appears in a new "Orphaned
  fields" section.
- A field that's on at least one screen does not appear there.
- If `manage:jira-project` alone doesn't work in practice (mirroring the earlier
  `read:field:jira` Beta-scope failure), that gets caught by empirical testing before this is
  called done, not assumed correct from the docs alone.
- The existing collision and possible-duplicate sections are visually unchanged in content,
  just reflowed under the new shared top bar.
- `forge lint` passes.

## Checks
- `forge lint` passes.
- `forge deploy -e development` succeeds.
- `forge install --upgrade -e development -p Jira -s isogun21.atlassian.net --confirm-scopes --non-interactive` (new scope requires reinstall).

## Verification
1. In Jira admin, create a throwaway custom field and deliberately don't add it to any
   screen — or identify an existing field known to be off every screen.
2. `forge deploy -e development`, then `forge install --upgrade ...` for the new scope.
3. Reload the Field Hygiene admin page.
4. Confirm: the orphaned field appears in a new "Orphaned fields" section with its type and
   ID; existing collision/possible-duplicate sections still show correctly above it; the
   rescan button appears once, at the top, regardless of which sections are populated.
5. If a `NEEDS_AUTHENTICATION_ERR` or permission error shows up in `forge logs`, that means
   `manage:jira-project` didn't work as expected empirically — report back before treating
   this as done, don't silently fall back to the 5-scope Beta bundle without discussing it.
6. Clean up the throwaway test field afterward if one was created.
