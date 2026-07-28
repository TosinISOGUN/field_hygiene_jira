# Fuzzy / Near-Duplicate Matching

## Goal
Fields whose names are *nearly* the same but not exact matches ("Story Point" vs "Story
Points", "Assignee Team" vs "Assigned Team") are surfaced as **possible** duplicates, clearly
marked as a lower-confidence heuristic guess, separate from the confirmed exact-match
collisions the app already reports. This is the more common real-world sprawl case, per the
2026-07-28 pivot.

## Context read
- `products/fieldwatch/CLAUDE.md` — "Pivot — 2026-07-28" (item 4, notes it "needs a
  confidence/similarity indicator in the UI so near-matches don't read as false certainty");
  "Code quality" (no new runtime dependencies without asking); Data model section.
- `products/fieldwatch/src/resolvers/index.js` — current `normalizeFieldName()` and
  `groupCollisions()`, both untouched by this prompt, extended alongside.
- `products/fieldwatch/src/frontend/index.jsx` — current results view, one section for exact
  collisions.
- developer.atlassian.com — `Lozenge` appearance values confirmed this session: `default`,
  `inprogress`, `moved`, `new`, `removed`, `success`. `removed` (red) is already used for
  Type-mismatch severity; this prompt uses a different appearance so "possible duplicate"
  doesn't read with the same certainty as a confirmed structural problem.

## Assumptions
- **No new dependency.** Similarity is computed with a small in-repo Levenshtein-distance
  function — not an npm package. This is an automatic-ASK category per `SKILLS.md`; flagging
  here that the plan is to avoid it entirely rather than ask for one.
- **Candidates are singleton fields only** — fields whose exact-normalized name has no other
  match (i.e. not already part of an exact-match collision in today's `collisions` list). A
  field already flagged as an exact duplicate doesn't also need a "possible duplicate" flag.
- **Similarity metric:** `1 - (levenshteinDistance(a, b) / max(a.length, b.length))` on the
  already-normalized (trimmed, lowercased, whitespace-collapsed) names. Threshold: **0.75**
  (75% similar) to qualify as a possible duplicate — conservative, to keep false positives
  low. This exact threshold is a judgment call and easy to tune after real-world use; flagging
  it explicitly rather than burying it as a magic number.
- **Pairwise, not clustering.** Each qualifying pair of singleton fields becomes its own
  `possibleDuplicates` entry. A field with two or more near-neighbors appears in multiple
  pair entries rather than one merged group — simpler to reason about and display than
  transitive clustering, acceptable for a v1 heuristic feature per the "smallest reasonable
  change" bar.
- Comparison is O(n²) over singleton fields (typically dozens to low hundreds on a real site)
  — negligible cost, no pagination or timeout concern.
- No change to the existing exact-match `collisions` list, its sorting, or the type-mismatch
  badge — this prompt adds a second, clearly-separated section below it.

## Files to change
- `products/fieldwatch/src/resolvers/index.js` — EDIT: add `levenshteinDistance()`,
  `nameSimilarity()`, and `findPossibleDuplicates()`; `getFieldCollisions` return shape gains
  `possibleDuplicates`.
- `products/fieldwatch/src/frontend/index.jsx` — EDIT: render a "Possible duplicates" section
  below the existing collision cards, each pair showing both fields and a similarity Lozenge.
- `products/fieldwatch/CLAUDE.md` — EDIT: document the new return shape and the similarity
  threshold as a named, tunable constant.

## What this builds
1. **`levenshteinDistance(a, b)`** — standard dynamic-programming edit distance, no
   dependency.
2. **`nameSimilarity(a, b)`** — `1 - levenshteinDistance(a, b) / Math.max(a.length, b.length)`,
   returns 0–1.
3. **`findPossibleDuplicates(fields, exactCollisions)`** — builds the singleton set (fields
   whose normalized name isn't in any exact `collisions` group), then compares every distinct
   pair of singleton fields' normalized names. Pairs scoring `>= 0.75` become
   `{ fieldA, fieldB, similarity }` entries, sorted by similarity descending.
4. **`getFieldCollisions`** returns `possibleDuplicates` alongside the existing `collisions`,
   `totalCustomFields`, `error`.
5. Frontend renders a new `Stack` section titled "Possible duplicates" (only when
   `possibleDuplicates.length > 0`), below the existing per-group cards. Each pair is its own
   small card: both field names, their types, and a `<Lozenge appearance="new">{Math.round(similarity * 100)}% similar</Lozenge>`.
   Explicit copy makes clear this is a suggestion, not a confirmed match (e.g. a one-line
   caption: "These names look similar but weren't flagged as exact duplicates — worth a
   manual look.").

## Security
No change. No new scope, no new API calls (same field list already fetched), nothing stored,
nothing logged.

## Done when
- On the dev site, two custom fields with genuinely similar-but-not-identical names (e.g.
  temporarily rename a field to "Story Point" alongside an existing "Story Points") appear in
  a new "Possible duplicates" section with a similarity percentage, without being folded into
  the exact-match "Duplicate names found" section above.
- A field with no exact or near duplicates doesn't appear in either section, same as today.
- `forge lint` passes.

## Checks
- `forge lint` passes.
- `forge deploy -e development` succeeds (no new scopes, no reinstall needed).

## Verification
1. In Jira, temporarily rename a custom field to something close-but-not-identical to an
   existing field name (e.g. "Story Point" next to an existing "Story Points").
2. `forge deploy -e development`.
3. Reload the Field Hygiene admin page.
4. Confirm the pair appears in a new "Possible duplicates" section with a similarity
   percentage, and that it's visually distinct (different Lozenge color, separate section)
   from the exact-match collisions above it.
5. Rename the test field back afterward.
