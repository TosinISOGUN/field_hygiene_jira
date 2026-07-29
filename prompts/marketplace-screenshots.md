# Marketplace screenshot capture guide

Reference doc for capturing the Rule-of-3 highlight screenshots required by the Marketplace
listing. Specs verified against current Atlassian docs 2026-07-30
(`developer.atlassian.com/platform/marketplace/building-your-presence-on-marketplace/`) —
not assumed from memory.

## What's required, per highlight (3 highlights total)

- A hero screenshot: **1840×900px**, PNG or JPG
- A cropped version of the same shot: **580×330px**, PNG or JPG
- A title (≤50 chars) and summary (≤220 chars) — already drafted below
- A caption on the screenshot itself (≤220 chars) — already drafted below
- Up to 5 extra screenshots per highlight (optional, same caption rule) — not planned for v1,
  add later if it strengthens the listing

## The three highlights

1. **"Catch duplicate fields instantly"** (title, 34 chars)
   Summary: "Exact and near-duplicate custom fields, grouped together — with a warning when
   colliding fields don't even share the same type."
   Screenshot: the **Duplicates** page (`/duplicates`), with real collision groups and at
   least one near-duplicate (similarity Lozenge) visible. Type-mismatch warning showing if
   the dev site has one — capture that state if possible, it's the most compelling case.
   Caption: "Duplicate and near-duplicate fields, grouped with a type-mismatch warning."

2. **"Stay under Atlassian's field limits"** (title, 34 chars)
   Summary: "A live read on how close every field configuration scheme and team-managed
   project is to Atlassian's field-count ceiling — before it becomes a hard stop."
   Screenshot: the **Field limits** page (`/limits`), showing the guardrail gauges for both
   company-managed schemes and team-managed projects.
   Caption: "Per-scheme and per-project field-count guardrails, not one misleading total."

3. **"See sprawl trending, not just today's snapshot"** (title, 44 chars)
   Summary: "A daily snapshot of every tracked count, charted over time, so you can tell
   whether field sprawl is getting better or worse."
   Screenshot: the **Trends** page (`/trends`), with the line chart showing at least a few
   days of real data — the more days visible, the better it reads.
   Caption: "Daily trend history for every tracked count — not a one-time scan."

## How to capture

1. `forge tunnel` (or a clean `forge deploy -e development` + open the app) against
   `isogun21.atlassian.net`, so the data on screen is real, not fabricated.
2. Before capturing, make sure the dev site actually has enough real signal to look
   convincing — a handful of genuine duplicate/near-duplicate fields, at least one field
   configuration scheme with a non-trivial field count, and several days of Trends history
   (the daily snapshot trigger needs to have run more than once — check `getFieldTrends`
   returns multiple `Snapshot` entries before capturing the Trends page).
3. Capture each page's content area at as high a resolution as the display allows — browser
   window maximized, zoom at 100%, OS scaling at 100% if possible, since upscaling a low-res
   capture to 1840×900 will look soft.
4. Crop/pad to exactly 1840×900 for the hero version. If the natural capture doesn't match
   that aspect ratio, pad with the app's own panel background color rather than stretching.
5. Resize the same crop down to 580×330 for the cropped version — don't re-crop differently,
   Atlassian's guidance is that the cropped shot should read as a smaller version of the same
   hero image, not a different framing.
6. Send me the raw captures once taken — I can handle the crop/resize/pad step precisely at
   the required pixel dimensions rather than doing it by eye.

## What I can't do here

I don't have a way to drive a browser against the real Jira admin page, so the actual
capture step is yours. Everything downstream of a raw screenshot (cropping to spec, resizing,
padding) I can do once you hand me the files.
