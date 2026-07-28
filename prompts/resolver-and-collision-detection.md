# Fieldwatch — Resolver & Collision Detection

## Goal
Invoking the resolver from Jira returns real duplicate-field data for the site: fetch every
custom field, filter out locked ones, group by normalized name, and return only the groups
with two or more fields. A temporary, minimal frontend change lets the owner see the raw
result on the actual dev site to verify it's correct — the real UI (loading/empty/error
states, table) is Prompt 3, not this one.

## Context read
- `products/fieldwatch/CLAUDE.md` — Data model, API contracts (endpoint verified this
  session), Design decisions (case-insensitive/trimmed matching, locked fields filtered out,
  no "original" label), Security rules, Error contract.
- `products/fieldwatch/manifest.yml` — confirms `read:field:jira` is already the declared
  scope; no manifest change needed in this prompt.
- developer.atlassian.com — `GET /rest/api/3/field/search` verified against the published
  OpenAPI spec this session: pagination shape (`startAt`/`maxResults`/`isLast`), `type=custom`
  and `expand=isLocked` query params, and the `Field` response shape. Recorded in `CLAUDE.md`
  under API contracts.

## Assumptions
- **Error contract shape (new, for your review):** `CLAUDE.md` says the resolver "returns a
  result the UI can render: success, empty, or an error" but doesn't give an exact shape. This
  prompt uses:
  `{ collisions: Collision[], totalCustomFields: number, error: string | null }` — `error` is
  `null` on success (collisions may be an empty array), and set to a plain-language message on
  failure (collisions `[]`, totalCustomFields `0`). This is additive to the shape already in
  `CLAUDE.md`, not a contradiction of it — flagging since it's the first time it's made
  concrete.
- Normalization = lowercase + trim + collapse internal whitespace to single spaces. Applied
  only for matching; the real field name is always what's returned/displayed.
- `maxResults=100` per page (Jira's practical max for this endpoint) to keep the pagination
  loop short on large sites. No hard cap on total pages — see Security note below.
- The temporary frontend change in this prompt renders the raw resolver output as plain
  `Text` (e.g. a JSON-ish dump or a simple list) — deliberately not styled, since Prompt 3
  replaces it entirely with `DynamicTable` + real states.

## Files to change
- `products/fieldwatch/src/resolvers/index.js` — EDIT: add `getFieldCollisions`, the fetch/
  filter/normalize/group logic, and the pagination loop.
- `products/fieldwatch/src/frontend/index.jsx` — EDIT (temporary/minimal): call `invoke()` on
  mount, render loading text then the raw result. Replaced wholesale in Prompt 3.

## What this builds
1. **`fetchAllCustomFields()`** (resolver-internal helper): loops `GET /rest/api/3/field/search`
   with `type=custom`, `expand=isLocked`, `maxResults=100`, advancing `startAt` by the page
   size until `isLast: true`. Uses `requestJira().asUser()` per the Security rules. Collects
   every page's `values` into one array.
2. **Filter:** drop any field where `isLocked === true`.
3. **Normalize:** one function, `normalizeFieldName(name)` — lowercase, trim, collapse
   internal whitespace. Used only as a grouping key, never for display. Lives in exactly one
   place per the "Data model" hard rule.
4. **Group:** bucket remaining fields by normalized name. Keep only buckets with `length >= 2`
   — a group of one is not a collision and must never be constructed as one (hard rule).
5. **`getFieldCollisions` resolver function:** orchestrates 1–4, maps each field to the public
   `Field` shape `{ id, name, type: schema.type }` (never leaks `isLocked` or anything else
   past this point), and returns
   `{ collisions: Collision[], totalCustomFields: number, error: null }`. `totalCustomFields`
   is the count *after* the locked-field filter (i.e., "fields we actually scanned"), so the
   later empty state can say "checked N fields, found no duplicates."
6. **Error handling:** wrap the Jira call in try/catch. On failure, log an operational fact
   only (e.g. "field fetch failed") — never log field names/content — and return
   `{ collisions: [], totalCustomFields: 0, error: "<plain-language message>" }`. The resolver
   itself never throws out to the UI.
7. **Temporary frontend wiring:** `src/frontend/index.jsx` calls
   `invoke('getFieldCollisions')` on mount and renders the raw result as plain text once it
   resolves — just enough for the owner to visually confirm real collisions show up correctly
   (or a clean empty state on a site with none). This is throwaway UI, not the deliverable.

## Security
- **Scope:** `read:field:jira`, already declared — nothing new.
- **`asUser()`**, not `asApp()` — matches the Security rules; an admin page is already
  admin-gated, so acting as the caller can't surface anything they couldn't already see.
- **No storage.** Every value here lives only inside the single resolver invocation.
- **No egress.** Only `requestJira()`, no external domains.
- **Logging:** on error, log the failure type only — never a field name, count included is
  fine (numbers aren't field content), but no name/description content ever reaches a log
  line.
- **Scales with instance size** (flagging per `CLAUDE.md`'s Forge-eligibility note, not a
  blocker): the pagination loop's cost grows with the number of custom fields on the site.
  Fine for a typical site; a site with an extreme custom-field count would mean more Jira API
  calls per page load. No action needed for v1 — noting it so it's not a surprise later.

## Done when
- `getFieldCollisions` exists in the resolver and is the only resolver function.
- Called against the real dev site, it returns real collisions if any exist, or
  `{ collisions: [], totalCustomFields: N, error: null }` if the site is clean.
- Locked fields never appear in a returned collision.
- A collision group is never returned with fewer than 2 fields.
- `error` is populated only when the Jira call genuinely fails, never on a legitimately empty
  result.

## Checks
- `forge lint` passes.
- `forge deploy -e development` succeeds.
- Manual: with the temporary frontend wiring, open the Fieldwatch admin page on
  `isogun21.atlassian.net` and confirm the raw output looks structurally correct (real field
  names, no locked fields, no singleton "collisions").

## Verification
1. Deploy to development (`forge deploy -e development`) — no reinstall needed, no new scopes.
2. Open `isogun21.atlassian.net` → Settings → Apps → Fieldwatch.
3. The page (still plain/unstyled) shows the resolver's raw JSON-ish output. If the dev site
   has any duplicate-named custom fields, they should appear grouped together; if not, it
   should show `totalCustomFields` matching what's actually in the site (spot-check against
   Jira's own field admin list) and an empty `collisions` array.
4. If it looks wrong (a locked field appears, a singleton group appears, or the count looks
   off), stop here and flag it — Prompt 3 builds the real UI on top of this contract, so it
   needs to be right first.
