# Field Hygiene for Jira

A free Forge app for Jira Cloud. One admin page that surfaces custom-field problems before
they become clutter: exact-name duplicates, near-duplicate names, unused fields, type
mismatches inside a collision, how close the site is to Atlassian's field-count guardrails,
and a daily trend line across all of it.

Built by Isogun Labs. Read `CLAUDE.md` for the full spec, decision history, and API contracts
— this file is just enough to get the project running locally.

## Requirements

See [Set up Forge](https://developer.atlassian.com/platform/forge/set-up-forge/) for the
Forge CLI and Atlassian account setup.

## Project structure

- `src/frontend/index.jsx` — the UI (`@forge/react` UI Kit, one `jira:adminPage`).
- `src/resolvers/index.js` — all backend logic: field fetching, collision/duplicate/unused
  detection, the field-count guardrail scan, and the daily Trends snapshot trigger.
- `src/index.js` — the manifest's actual entry point; re-exports the resolver `handler` and
  the `dailySnapshotTrigger` scheduled-trigger handler from `src/resolvers/index.js`.
- `manifest.yml` — modules, scopes, the scheduled trigger.
- `prompts/` — the implementation prompts this app was built from, one per feature, each
  approved before the code behind it was written (see `SKILLS.md` at the studio root for the
  workflow).

## Commands

```
forge lint                                                                  # validate before every deploy
forge deploy -e development                                                 # ship code/manifest changes
forge install -e development -p Jira -s isogun21.atlassian.net --confirm-scopes --non-interactive   # first install
forge install --upgrade -e development -p Jira -s isogun21.atlassian.net --confirm-scopes --non-interactive  # after a scope/module change
forge tunnel                                                                 # local dev, hot-reloads code changes
forge logs -e development                                                    # check resolver/trigger logs
```

Reinstall (`--upgrade`) is required after any change to `manifest.yml`'s scopes or modules —
a plain redeploy alone won't apply new permissions.

## Notes

- Dev site: `isogun21.atlassian.net`, Developer Space **Isogun Labs** (shared with Recap).
- `forge deploy` persists code; `forge install` puts the app on a site for the first time;
  after that, the site picks up new deploys automatically.
- The scheduled Trends snapshot fires once a day, starting ~5 minutes after the first deploy
  — there's no CLI command to force-fire it for testing, so verifying real trend data needs
  a couple of days of real elapsed time.
