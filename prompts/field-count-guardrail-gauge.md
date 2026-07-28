# Field-Count Guardrail Gauge

## Goal
The admin sees how close their site is to Atlassian's field-count limits — 700 fields per
field-configuration scheme for company-managed (classic) projects, 50 custom fields per
team-managed (next-gen) project — broken out per scheme/project since the limit genuinely
isn't site-wide, not collapsed into one misleading number.

## Context read
- `products/fieldwatch/CLAUDE.md` — pivot item 2 (the "per-scheme, not site-wide" finding
  from 2026-07-28, and the decision to build this properly rather than as a single misleading
  "X of Y" figure); pivot item 1's lesson (check whether an endpoint already fetched has an
  `expand`/filter before reaching for a new one) — applied below, `projectIds` on
  `/field/search` avoids an N-calls-per-field design.
- Live Jira Cloud OpenAPI v3 spec, queried directly this session:
  - `GET /rest/api/3/config/fieldschemes` — **not deprecated** (unlike
    `/rest/api/3/fieldconfigurationscheme`, which is). Returns `fieldsCount` **directly per
    scheme** — no need to separately paginate each scheme's field list to count it.
  - `GET /rest/api/3/config/fieldschemes/{id}/projects` — project `{id, key, name}` list per
    scheme.
  - `GET /rest/api/3/project/search` — already needs only `read:jira-work` (already held,
    confirmed against its security block), returns `style: "classic" | "next-gen"` and
    `simplified: boolean` **by default, no expand needed** (confirmed from the endpoint's own
    example response).
  - `GET /rest/api/3/field/search` already supports a `projectIds` query param (missed in
    earlier research) — `?type=custom&projectIds={id}&maxResults=1` gives a team-managed
    project's custom-field count via `total`, **one call per project**, not one call per
    field. Same endpoint, same `read:jira-work` scope already in use elsewhere in this app.
- `products/fieldwatch/src/resolvers/index.js` — current `fetchAllCustomFields()` and
  `getFieldCollisions`, extended alongside.

## Assumptions
- **New scope: `manage:jira-configuration`** (Current-state), needed only for
  `/config/fieldschemes` and `/config/fieldschemes/{id}/projects`. The Beta alternative is
  two different scopes across the two endpoints (`read:field-configuration-scheme:jira` and
  `read:field-configuration:jira`) — per the established "prefer Current, test empirically"
  pattern, and given `manage:jira-project` (name aside) turned out fine last time, going with
  `manage:jira-configuration` and testing it the same way before calling this done.
- **`fieldsCount` on a scheme includes system fields, not just custom ones** — that's
  correct and intentional, since Atlassian's 700 limit counts all fields in the
  configuration, not only custom ones. This is the one place in the app where a number isn't
  custom-fields-only; worth a UI note so it doesn't read as inconsistent with the rest of the
  page.
- **Team-managed field counts add one API call per team-managed project**, batched the same
  way the (now-removed) orphan-scan was — `Promise.all` in batches of 10 — to avoid bursting
  rate limits on sites with many next-gen projects.
- **Deleted/archived projects**: `FieldAssociationSchemeProjectSearchResult` has a `deleted`
  flag — excluded from what's shown, since a scheme's field count still includes fields tied
  to a deleted project's history but showing "affects: [deleted project]" would confuse the
  admin about what's actually actionable.
- This adds real latency to the single combined scan (more API calls than before) —
  acceptable given the existing "recomputed live on page load" model, but flagging it as a
  real, not free, tradeoff rather than pretending it's costless.
- No storage — still computed fresh every scan, same as everything else except the future
  Trends feature.

## Files to change
- `products/fieldwatch/manifest.yml` — EDIT: add `manage:jira-configuration` to
  `permissions.scopes`.
- `products/fieldwatch/src/resolvers/index.js` — EDIT: add `fetchProjects()`,
  `fetchSchemeGuardrails()`, `fetchTeamManagedGuardrails()`; `getFieldCollisions` return shape
  gains `schemeGuardrails` and `teamManagedGuardrails`.
- `products/fieldwatch/src/frontend/index.jsx` — EDIT: new "Field limits" section, one row per
  scheme/project, sorted by percentage-of-limit descending, warning badge above 80%.
- `products/fieldwatch/CLAUDE.md` — EDIT: document the new scope, new data shapes, mark pivot
  item 2 built.

## What this builds
1. **`fetchProjects()`** — loops `GET /rest/api/3/project/search` (paginated), returns all
   projects with `{ id, key, name, style }`.
2. **`fetchSchemeGuardrails()`** — loops `GET /rest/api/3/config/fieldschemes` (paginated),
   for each scheme also fetches `GET /rest/api/3/config/fieldschemes/{id}/projects` (paginated,
   `deleted: false` only) to get the affected project list. Returns
   `{ schemeId, schemeName, fieldsCount, limit: 700, projects: [{key, name}] }[]`.
3. **`fetchTeamManagedGuardrails(projects)`** — filters `projects` to `style === 'next-gen'`,
   batches of 10, `GET /field/search?type=custom&projectIds={id}&maxResults=1` per project,
   reads `total`. Returns `{ projectKey, projectName, fieldsCount, limit: 50 }[]`.
4. `getFieldCollisions` calls all three alongside the existing fetch/detection logic, adds
   `schemeGuardrails` and `teamManagedGuardrails` to the return shape. Failures here follow
   the same soft-fail pattern used previously (doesn't invalidate collision/duplicate/unused
   results) — a `guardrailError` string, null on success.
5. Frontend: new "Field limits" section (own heading, included in the `hasAnySignal` gate —
   actually always shown when there's at least one scheme/project, regardless of whether it's
   near its limit, since "you're nowhere close" is itself useful information, unlike the
   other three sections which only appear when there's something to flag). Each row: name,
   a `ProgressBar` (fieldsCount / limit), and a `Lozenge appearance="removed"` badge when
   usage is at or above 80% of the limit. A one-line caption clarifies scheme counts include
   system fields, project counts are custom-fields-only.

## Security
**New scope: `manage:jira-configuration`** (Current-state) — automatic ASK, already surfaced
here. Used only for reading scheme/project field-association data; no write capability
exercised. `asUser()` throughout, consistent with the rest of the app. Requires
`forge install --upgrade` after deploy, same pattern as every prior scope change.

## Done when
- On the dev site, the "Field limits" section shows at least one company-managed scheme (with
  its real `fieldsCount`) and, if any team-managed projects exist, their custom-field counts
  against 50.
- A scheme/project at or above 80% of its limit shows a warning badge; one comfortably under
  does not.
- `forge lint` passes.
- The new scope is confirmed working empirically (`forge logs`, no auth errors) before this
  is called done — not assumed from the docs alone.

## Checks
- `forge lint` passes.
- `forge deploy -e development` succeeds.
- `forge install --upgrade -e development -p Jira -s isogun21.atlassian.net --confirm-scopes --non-interactive`.

## Verification
1. `forge deploy -e development`, then `forge install --upgrade ...`.
2. Reload the Field Hygiene admin page.
3. Confirm the "Field limits" section appears with real scheme/project data and sensible
   numbers (compare the scheme's `fieldsCount` against what you'd expect from the dev site's
   actual project setup).
4. Check `forge logs` for any auth/permission errors on the new scope.
5. In Jira admin → Manage apps → Field Hygiene for Jira, confirm the new scope is listed.
