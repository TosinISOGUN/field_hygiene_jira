# Fieldwatch — Scaffold & Manifest

## Goal
A Forge app named `fieldwatch` exists in `products/fieldwatch/`, installs clean on the dev
Jira site, and renders a (default, empty) admin page under Jira settings. No business logic
yet — just a verified, revenue-share-eligible skeleton with the correct manifest. This is the
foundation the resolver (Prompt 2) and UI (Prompt 3) build on.

## Context read
- `products/fieldwatch/CLAUDE.md` — scope, three-layer architecture, security rules,
  out-of-scope list, and the four now-answered design questions.
- `SKILLS.md` — workflow, prompt template, model split.
- `products/recap/CLAUDE.md` + `products/recap/manifest.yml` — the prior app's real, verified
  Forge CLI invocations, `app.runtime` block, and manifest style, for cross-app consistency.
- developer.atlassian.com — `jira:adminPage` module reference (`render: native`, `resolver`,
  single-entry rule) and the Jira REST issue-fields group (endpoint/scope research; the scope
  is declared here, first *used* in Prompt 2).

## Assumptions
- Forge CLI is installed and logged in (per Recap: `C:\Users\DELL\AppData\Roaming\npm\forge`),
  and the dev site is `isogun21.atlassian.net`.
- A current UI Kit "Jira admin page" template exists in `forge create`; its exact label is
  confirmed interactively at build time, not guessed.
- Granular scope for `GET /rest/api/3/field` is `read:field:jira` (classic equivalent
  `read:jira-work`) — confirmed against docs at build time before it lands in the manifest.
- **Licensing — resolved by owner.** Fieldwatch ships free in v1, but the manifest pre-wires
  `licensing.enabled: true` now. This avoids a disruptive major-version bump and admin
  re-approval across existing installs if a later version is ever paid. Marketplace pricing
  (not the manifest) controls that it's free today.

## Files to change
- `products/fieldwatch/manifest.yml` — NEW
- `products/fieldwatch/package.json` — NEW (from `forge create`, trimmed)
- `products/fieldwatch/src/index.js` — NEW (resolver entry; skeleton `definitions` only)
- `products/fieldwatch/src/frontend/index.jsx` — NEW (UI Kit skeleton; default text, no logic)
- `products/fieldwatch/.gitignore` — NEW (mirror Recap: `node_modules/`, `.forge/`, etc.)
- `products/fieldwatch/CLAUDE.md` — EDIT: (1) fill the empty **Commands** section with the
  real verified invocations; (2) remove `isLocked` from the `Field` shape in the Data model,
  per the answered endpoint question.

## What this builds
1. Run `forge create` (UI Kit → Jira → admin-page template) into a scratch name, then move the
   generated files into the existing `products/fieldwatch/` so they sit alongside the current
   `CLAUDE.md` and this `prompts/` dir. (`forge create` refuses a non-empty target, hence the
   generate-then-move.)
2. Reshape `manifest.yml` to the minimum: exactly one `jira:adminPage` (`render: native`,
   `resolver.function`, `title: Fieldwatch`), one `function` entry, one `resources` entry
   pointing at the frontend, `permissions.scopes: [read:field:jira]`, and
   `licensing.enabled: true` (pre-wired per owner's call, even though v1 is free). `app.runtime`
   block copied from Recap (nodejs, arm64). **No** `llm` module, **no** storage, **no**
   `remotes` / external permissions, **no** Connect modules.
3. Trim the scaffold's default resolver and UI to a bare skeleton: the resolver registers no
   real functions yet (or one no-op), and the admin page renders a single static line (e.g.
   "Fieldwatch"). The point of this prompt is a clean install, not behaviour.
4. Fill the `CLAUDE.md` Commands section with the actual invocations used, and drop `isLocked`
   from the data model.

## Security
- **One scope declared: `read:field:jira`** (read-only field metadata for the site). Nothing
  is called yet in this prompt; the scope is declared now so install happens once, avoiding a
  later scope-triggered `forge install --upgrade` + admin re-approval.
- No storage of any kind. No egress / no external domains. No `asApp` — all future Jira access
  is `asUser` (Prompt 2). No secrets in the repo.
- Zero Connect modules → revenue-share eligibility preserved.

## Done when
- `products/fieldwatch/` contains a Forge app: `manifest.yml`, `package.json`, `src/`.
- `manifest.yml` has exactly one `jira:adminPage`, one scope (`read:field:jira`), zero storage
  calls, zero egress, zero Connect modules, zero `llm` module.
- `CLAUDE.md` Commands section is filled with real invocations; `isLocked` is gone from the
  data model.
- The app installs on `isogun21.atlassian.net` and a "Fieldwatch" page appears in Jira admin.

## Checks
- `forge lint` passes. (An "unused scope" note for `read:field:jira` is expected here and is
  resolved in Prompt 2 — anything else is investigated.)
- `forge deploy -e development` succeeds.
- `forge install -e development -p Jira -s isogun21.atlassian.net --confirm-scopes
  --non-interactive` succeeds (exact flags confirmed against Recap's verified command).

## Verification
1. In `isogun21.atlassian.net`, go to the **cog/Settings → Apps → Manage apps** (or the admin
   apps area where admin pages appear).
2. Confirm a **Fieldwatch** entry is listed and opens to the skeleton page without error.
3. Confirm the browser shows the app under the site's admin section (admin-gated), not a
   project or global page.
