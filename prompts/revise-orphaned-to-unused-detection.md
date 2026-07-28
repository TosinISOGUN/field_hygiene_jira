# Revise Orphaned-Field Detection to Real Unused-Field Detection

## Goal
Drop the `manage:jira-project` scope and the N-call `/field/{fieldId}/screens` approach built
in `prompts/orphaned-field-detection.md`. Replace with `expand=screensCount,lastUsed` on the
existing `/field/search` call (already made, already scoped) — cheaper, and accurate enough to
upgrade the feature from "orphaned" (zero screens only) back to genuine **"unused fields"**,
matching Site Optimizer's real definition (no screen, or no activity in 2 years) instead of
the narrower version shipped last prompt.

## Context read
- `products/fieldwatch/CLAUDE.md` — pivot item 1 section (the "orphaned, not unused" decision
  this prompt reverses, and why); "Revenue share"/"Security rules" (minimum viable scope).
- Live Jira Cloud OpenAPI v3 spec, queried directly this session: `/field/search`'s `expand`
  parameter documents `screensCount` (int) and `lastUsed` (`{ type: TRACKED | NOT_TRACKED |
  NO_INFORMATION, value: date-time }`) as available fields, confirmed to need **no scope
  beyond `read:jira-work`** (checked the endpoint's own security block, unaffected by which
  `expand` values are requested).
- `products/fieldwatch/src/resolvers/index.js` — current `fetchAllCustomFields()`,
  `isFieldOrphaned()`, `findOrphanedFields()` (the last two are removed by this prompt).
- `products/fieldwatch/manifest.yml` — current scopes, `manage:jira-project` removed.

## Assumptions
- **"Unused" criteria:** a field qualifies if `screensCount === 0` (definitely unused, nobody
  can enter data) **or** `lastUsed.type === 'TRACKED'` and `lastUsed.value` is more than 2
  years old (matches Site Optimizer's stated window). If `lastUsed.type` is `NOT_TRACKED` or
  `NO_INFORMATION`, the temporal check is skipped for that field — only the screen check
  applies, since Jira itself has no usable signal there. This isn't a byte-for-byte
  reimplementation of Site Optimizer (no "created by an admin, not an app" filter — already
  covered indirectly by the existing locked-field exclusion) but is materially closer than
  the "orphaned" version, and the label reverts to **"Unused fields"** since it now earns
  that word.
- Each unused field gets a `reason` — `'no-screen'` or `'stale'` (or both conditions could be
  true; screen check takes display priority since it's the stronger, unambiguous signal) — so
  the UI can say *why*, not just *that*.
- **This removes a scope** (`manage:jira-project`) after only one prompt of it being live —
  worth being upfront about rather than treating as routine churn; happens because the better
  approach was found one prompt too late, not because the first approach was wrong given what
  was known at the time.
- No change to collision or fuzzy-duplicate detection, or their scopes.

## Files to change
- `products/fieldwatch/manifest.yml` — EDIT: remove `manage:jira-project` from
  `permissions.scopes`.
- `products/fieldwatch/src/resolvers/index.js` — EDIT: `fetchAllCustomFields()` requests
  `expand=isLocked,screensCount,lastUsed`; remove `isFieldOrphaned()`/`findOrphanedFields()`;
  add `findUnusedFields()` operating on the already-fetched field list, no extra API calls.
- `products/fieldwatch/src/frontend/index.jsx` — EDIT: rename "Orphaned fields" section to
  "Unused fields", update copy, show each field's reason.
- `products/fieldwatch/CLAUDE.md` — EDIT: replace the orphaned-field documentation with the
  unused-field version; note the scope removal explicitly, not silently.

## What this builds
1. `fetchAllCustomFields()`'s request URL gains `expand=isLocked,screensCount,lastUsed`
   alongside the existing `type=custom` — one query string change, same pagination loop.
2. `findUnusedFields(fields)` — for each field, compute `isStale` (`lastUsed?.type ===
   'TRACKED' && (Date.now() - new Date(lastUsed.value).getTime()) > TWO_YEARS_MS`) and
   `hasNoScreen` (`screensCount === 0`). Include the field as `{ id, name, type, reason }`
   when either is true — `reason: hasNoScreen ? 'no-screen' : 'stale'`.
3. `TWO_YEARS_MS` is a named constant (`2 * 365 * 24 * 60 * 60 * 1000`), matching Site
   Optimizer's documented window.
4. `getFieldCollisions` drops the try/catch around the old async orphan scan (no longer
   async, no longer a separate network call that can fail) — `orphanScanError` is removed
   from the return shape entirely, since there's nothing left that can fail independently of
   the main field fetch.
5. Frontend: "Orphaned fields" → "Unused fields", caption updated to mention both reasons
   (e.g. "Not attached to any screen, or no activity in over 2 years."), each row's Type
   column area (or an added column) shows which reason applied — simplest: keep the existing
   three-column table and add the reason as a small `Lozenge` next to the field name, same
   pattern already used for type-mismatch and possible-duplicate badges.

## Security
**Removes** `manage:jira-project` from `manifest.yml` — a scope reduction, not an addition,
but still a manifest/permission change worth calling out explicitly rather than folding in
quietly. No new scope. `expand` params on `/field/search` confirmed to need nothing beyond
the already-held `read:jira-work`.

## Done when
- On the dev site, the existing zero-screen fields still appear, now under "Unused fields"
  with a "no screen" reason badge.
- `forge lint` passes with no reference to the removed functions or scope.
- `manifest.yml` no longer lists `manage:jira-project`.

## Checks
- `forge lint` passes.
- `forge deploy -e development` succeeds.
- `forge install --upgrade -e development -p Jira -s isogun21.atlassian.net --confirm-scopes --non-interactive` (scope changed, still needs a reinstall to sync permissions even though it's a removal).

## Verification
1. `forge deploy -e development`, then `forge install --upgrade ...`.
2. Reload the Field Hygiene admin page.
3. Confirm the "Unused fields" section still shows the fields seen before (now with a
   "no screen" reason badge), and that `forge logs` shows no errors.
4. Confirm in Jira admin → Manage apps → Field Hygiene for Jira that the permissions list no
   longer includes the project-management scope, only the two remaining ones.
