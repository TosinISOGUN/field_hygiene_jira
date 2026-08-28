# Field Hygiene for Jira

A Forge app for Jira Cloud. One admin page that surfaces custom-field problems before they
become clutter: exact-name duplicates, near-duplicate names, unused fields, type mismatches
inside a collision, missing descriptions, how close the site is to Atlassian's field-count
guardrails, and a daily trend line across all of it.

The buyer and the user are the same person: the Jira admin who has to live with whatever
custom-field sprawl the site accumulates.

Sold on the [Atlassian Marketplace](https://marketplace.atlassian.com/), paid via Atlassian.
Built by [Isogun Labs](https://isogunlabs.com/).

![Status](https://img.shields.io/badge/status-live%20on%20Marketplace-15803D)
![Platform](https://img.shields.io/badge/platform-Atlassian%20Forge-0052CC)
![Runs on Atlassian](https://img.shields.io/badge/Runs%20on%20Atlassian-yes-15803D)
![Version](https://img.shields.io/badge/version-2.1.0-123C39)

**Status:** live on the [Atlassian Marketplace](https://marketplace.atlassian.com/apps/2905942594)
(listing turned public 10 August 2026, after resubmission on 29 July 2026 fixed an automatic
rejection). Full submission history is in `CLAUDE.md`.

---

## What it does

1. A Jira admin opens **Field Hygiene** from the site's **Apps** menu.
2. It reads every custom field's name, type, screen usage, and description, plus every
   field-configuration scheme and team-managed project's field count.
3. One page shows: exact-name duplicates (flagged if the colliding fields don't even share a
   type), near-duplicates by name similarity, unused fields (no screen, or stale 2+ years),
   fields with no description, and a live per-scheme/per-project read on Atlassian's
   field-count guardrails.
4. A daily scheduled snapshot charts all four tracked counts over time, so sprawl trend — not
   just a one-time scan — is visible.
5. An Export panel formats the current scan as plain text to copy into a ticket, spreadsheet,
   or chat message.

Read-only, always. Field Hygiene never renames, merges, or deletes a field — it reports, the
admin fixes it in Jira.

## How it's built

Everything runs on Atlassian Forge — no external services, no third-party hosting, no
database beyond one small aggregate table. This keeps the app in the "Runs on Atlassian"
tier (Forge modules only, OAuth, Forge UI), which matters commercially.

- **`@forge/react`** (UI Kit) — a single `jira:adminPage` module, internally routed
  (`@forge/react/router`) into five views: Overview, Duplicates, Cleanup, Field limits, Trends.
- **`@forge/resolver`** — backend logic: field fetch/pagination, collision grouping,
  fuzzy-match scoring, guardrail computation, report formatting.
- **`@forge/api`** (`requestJira`) — reads Jira as the requesting user (`asUser()`) for every
  interactive call; the one daily scheduled trigger uses `asApp()` since scheduled triggers
  have no user context.
- **`@forge/kvs`** — the single storage exception in this app: one daily aggregate snapshot
  (4 integers, no field names/IDs/content) for the Trends chart, pruned after 90 days.

### Layout

| Path | What's there |
| --- | --- |
| `manifest.yml` | One `jira:adminPage` module, scopes (`read:jira-work`, `manage:jira-configuration`, `storage:app`), the daily scheduled trigger |
| `src/index.js` | Manifest entry point — re-exports the resolver handler and the scheduled-trigger handler |
| `src/resolvers/index.js` | All backend logic: field fetching, collision/duplicate/unused/missing-description detection, the guardrail scan, the daily Trends snapshot |
| `src/frontend/index.jsx` | UI Kit app — five routed views, all loading/empty/error states, the Export panel |
| `prompts/` | The implementation prompts this app was built from, one per feature, each approved before the code behind it was written |

The public marketing/support/docs/privacy site (`field-hygiene.isogunlabs.com`) lives in
`site/` in *this* repo — a nested Git repo (remote `field-hygiene-privacy`) deploying to
GitHub Pages on its own, independent of this app's deploy/install commands. `assets/marketplace/`
holds the Marketplace listing images (logo, banner, highlight screenshots).

## Commands

The Forge CLI may not be on PATH in a fresh shell. In Git Bash, prepend your global npm bin
(e.g. `export PATH="$PATH:/c/Users/<you>/AppData/Roaming/npm"`).

| Task | Command |
| --- | --- |
| Lint | `forge lint` |
| Deploy (dev) | `forge deploy -e development` |
| Deploy (production) | `forge deploy -e production` |
| Install (first time) | `forge install -e development -p Jira -s your-site.atlassian.net --confirm-scopes --non-interactive` |
| Upgrade after new scopes/modules | `forge install --upgrade -e development -p Jira -s your-site.atlassian.net --confirm-scopes --non-interactive` |
| Tunnel (live reload) | `forge tunnel` |
| Logs | `forge logs -e development` |

Reinstall (`--upgrade`) is required after any change to `manifest.yml`'s scopes or modules —
a plain redeploy alone won't apply new permissions. The scheduled Trends snapshot fires once
a day starting ~5 minutes after the first deploy; there's no CLI command to force-fire it, so
verifying real trend data needs a couple of days of elapsed time.

## Scope discipline

No config or settings page, no naming-policy rules, no writes to Jira, no AI/LLM, no
Confluence or multi-product support, no event-driven notifications beyond the one daily
snapshot trigger Trends needs. Full out-of-scope list and the reasoning behind each line is
in `CLAUDE.md`.

## Pricing

Free for Jira sites of 10 users or fewer. **$1.50/user/month** above that (base rate;
Atlassian's own tiered-pricing mechanism applies automatic volume discounts as seat count
climbs). Same features at every tier — nothing held back on the free plan.

## Privacy & support

- **Privacy policy:** https://field-hygiene.isogunlabs.com/privacy.html
- **Security policy:** https://field-hygiene.isogunlabs.com/security.html
- **Support:** support@isogunlabs.com

Field Hygiene stores exactly one thing — a daily aggregate count for the Trends chart, kept
90 days and auto-pruned — never a field name, ID, or other identifying content. Everything
else it shows is computed fresh, in memory, on every page load.

## Changelog

### 2.1.0 — July 2026
- Marketplace submission: fixed an automatic rejection (missing Privacy & Security tab
  answers), resubmitted 29 July 2026, approved and listing turned public 10 August 2026.
- Marketplace listing assets: logo, composited banner, 3 required Highlight screenshots
  plus 2 extras, all real captures from a live dev site.
- Fixed a real product bug found while preparing screenshots: the duplicate-fields chart was
  rendering a meaningless "a / b" legend from a decorative-only color accessor.

### 2.0.0 — July 2026
- Pivoted past pure duplicate-name detection: near-duplicate (fuzzy) matching, type-mismatch
  severity, unused-field detection, missing-description detection, the field-count guardrail
  gauge, and daily Trends — all shipped the same day, each individually approved.
- Renamed the customer-facing listing from "Fieldwatch — Duplicate Field Finder for Jira" to
  "Field Hygiene for Jira" to match the expanded scope.
- Route split into five views under one `jira:adminPage` module.
- Moved from free-forever to per-seat tiered pricing (free ≤10 users, $1.50/user/month above).
- First production deploy; first Marketplace submission.

### 1.0.0 — July 2026
- First build: exact-name duplicate detection only, one `jira:adminPage`, `read:jira-work`
  scope, free.

---

*An independent Atlassian Marketplace app by Isogun Labs. Not affiliated with or endorsed by
Atlassian.*
