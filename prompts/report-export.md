# Report export (copy-as-text, not file download)

## Goal
An admin can get the current scan's results out of the app as plain text they can paste into a
spreadsheet, ticket, or Slack message — without Field Hygiene storing, scheduling, or emailing
anything.

## Context read
`CLAUDE.md` ("Exports are under exploration, not yet approved" — the original note said a
stateless, user-triggered, per-click export is materially smaller than the banned
scheduled/automated kind, but flagged that UI Kit native's clipboard/download support was
unconfirmed). Checked current Forge docs directly (`developer.atlassian.com/platform/forge/
ui-kit/components/`) for every UI Kit native component and `@forge/bridge`'s exported API.

**Finding — this changes the shape of the feature from what "CSV export" usually implies:**
UI Kit native has **no clipboard-write API and no file-download mechanism** at all — not in
`@forge/react`'s component list, not in `@forge/bridge`. The `File Card`/`File Picker`
components that exist are EAP, and built for *uploads*, not exporting generated content. There
is no way, today, for a UI Kit native app to trigger an actual `.csv` file download or write to
the OS clipboard programmatically. This isn't a workaround-away limitation — it's the sandboxed
iframe having no such bridge call exposed.

**What's actually buildable:** `TextArea` supports `value`, `isReadOnly`, and `isMonospaced`
props (confirmed against current docs). So the real feature is: render the current scan as
comma-separated text inside a read-only, monospaced `TextArea`, and the admin selects all
(click in the box, Ctrl/Cmd+A) and copies manually with their OS's normal copy shortcut. No
button-triggered clipboard write, no download — a visible, selectable text block. This is a
downgrade from a one-click "Export CSV" button, and I want that named explicitly before
building it rather than have it look like a broken button when it's actually working as
designed.

## Assumptions
- "Copy manually from a text box" is an acceptable version of "export" for v1, given no better
  mechanism exists in UI Kit native today. If this isn't good enough, the only escalation path
  is porting the whole app (or this one panel) to **Custom UI** (a real iframe with the
  Clipboard API and `<a download>` available) — a materially bigger change (new build model,
  own bundler, `@forge/bridge` becomes the only Forge access point) that CLAUDE.md's "Forge UI
  Kit native, via `@forge/react`" design decision currently rules out. Not proposing that here;
  flagging it exists.
- Export covers whatever the current scan already computed (collisions, possible duplicates,
  unused fields, guardrails) — no new data, no new API call.

## Files to change
- `src/frontend/index.jsx` — new `buildReportText(result)` helper (pure formatting, no API
  call), a `Button` that toggles a `TextArea` open/closed showing the formatted text, placed
  next to the existing rescan button.
- `CLAUDE.md` — replace "Exports are under exploration, not yet approved" with what was built,
  the "no clipboard/download API" finding (so nobody re-proposes a one-click download button
  without rediscovering this), and update the Out-of-scope list's export line.

## What this builds
- `buildReportText(result)`: plain-text, comma-separated rows, one section per signal
  (Duplicate names, Possible duplicates, Unused fields, Missing descriptions if that prompt
  ships too, Field limits) — header row per section, blank line between sections. Pure string
  building from data already in `result`, nothing fetched.
- An "Export" `Button` (`iconBefore="export"` if that icon exists in the Atlassian icon set,
  otherwise unlabeled) that toggles a `isExportOpen` boolean.
- When open: a `SectionMessage` ("Click inside the box, select all, and copy") above a
  `isReadOnly isMonospaced` `TextArea` with `value={buildReportText(result)}`.
- No new resolver function — this is 100% frontend formatting of data the resolver already
  returned for the current scan.

## Security
No new scope, no new API call, no storage, no egress. Text never leaves the rendered page
until the admin manually copies and pastes it themselves.

## Done when
- Clicking Export reveals a read-only text box containing every section of the current scan in
  a comma-separated, human-readable format.
- Clicking Export again hides it.
- The content updates after Rescan (reflects the latest `result`, not a stale snapshot).

## Checks
`forge lint`

## Verification
1. Open Field Hygiene on the dev site with at least one duplicate-name group present.
2. Click "Export."
3. Confirm a text box appears containing the duplicate group's field names in a
   comma-separated format, matching what's shown in the results above it.
4. Click inside the box, Ctrl/Cmd+A, Ctrl/Cmd+C, paste into Notepad — confirm the pasted text
   matches.
5. Click Export again, confirm the box collapses.
