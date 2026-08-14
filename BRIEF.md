# BRIEF — coupling, knowledge risk, commit shape, flux, work rhythm + custom Heatmap

**Q1 — What exactly.** Two increments. (1) One new grouped `git log` pass (commit-delimited,
non-merge, windowed: hash + author + files) plus two extended existing passes feed five new
analyses: temporal coupling (pair counts + confidence), knowledge risk (per-file top author
+ their repo-wide inactivity), commit granularity (median files/commit, mega-commits,
largest, merge share), contributor flux (first-seen/last-seen, new authors per year), and
work-rhythm buckets (weekday × hour, author-local time). Rendered as two new tabs and two
grown ones. (2) A registry module — `extendRegistry(defaultRegistry, { Heatmap })` — as the
single source of truth for gate AND preview, plus a token-styled Heatmap used for the 7×24
rhythm grid and a co-change matrix. NOT building: `--numstat` line churn, `--follow` rename
tracking, any second chart primitive. The user's recurring action: run `history`+`preview`
on an unfamiliar repo and decide where reading time and onboarding risk are.

**Q2 — How I'll know.** `bun run typecheck` clean; `bun run test` green including new
hand-counted fixture checks (a >10-file commit excluded from pairs and disclosed; median
files/commit; Monday-09:00 bucket; new-author year; 100%-share file); break pair-counting
once and watch it go red; `bun run history` on this real repo passes both gates with
Heatmap resolved; `bun run history && bun run preview` + screenshot shows the heatmap
painting in theme, all six tabs legible; empty-window (`--since 2099`), single-commit, and
all-single-file-commit repos produce valid pages that say why sections are empty.

**Q3 — Wrong-thing risks.** Character: every figure derived, every population named, every
proxy labelled — so rhythm must say "author-local time, rewritten by rebases", coupling must
name its 2–10-file population, knowledge risk must call inactivity a proxy for departure.
The registry is the one-way door: emitted documents naming `Heatmap` render only on a host
with this registry — gate and preview must consume one shared module or the gate approves
what the host can't draw. Adversarial-verify before done.

**Follow-ups after review:** tab bar reverted to the library's native sideways scroll at
the owner's request (wrap read as broken layout); a latent trap fixed on the way — east of
UTC, `--since=1970-01-01` parses to a negative epoch git reads as "after everything",
silently emptying the log (fixtures now use 2000-01-01; README and memory document it).
Then the knowledge tracker: a "Who knows what" tab holding the knowledge-risk table plus
per-author pill sub-tabs (top 8, remainder disclosed) of each author's files with the
share read both ways — of their commits, and of the file (the same figure knowledge risk
flags). Same grouped-pass records, no new git pass. Hand-counted fixture checks added
(Alice [a.ts 2, b.ts 1, d.ts 1]; windowed drop; 11 tables; nested Tabs = 2; a both-ways
50%/50% row whose first draft was matchable by another table — tightened until sabotage
went red). Paths in knowledge tables now yield via `overflow-wrap: anywhere` so verdict
columns never clip — re-measured 0px overflow on the widest author panel.

**Identity folding (follow-up):** authors were split per recorded `user.name`/`user.email`
string; `foldIdentities` now merges identities sharing a name or an email (transitive,
case-insensitive, empty fields never bridge, .mailmap applies first via %aN/%aE, most-used
name labels the group), decided over all history so windowing cannot re-split a person.
Applied to every author-keyed figure (authors, ownership, spans, flux, fires). Rule stated
on the page and in README. Evidence: unit + fixture checks hand-counted (3 spellings → 1
author; ties by name; case fold keeps casing); sabotage of the email bridge → 6 checks
red; cadence 3 identities → 1 author; megatix 8 windowed identities → 6 authors, with
"Peter" vs "Peter Hume" correctly left split (no shared field — only a mailmap can link
them). Typecheck + full suite green.

## Evidence

- `bun run typecheck` → `tsc --noEmit`, exit 0, no diagnostics.
- `bun run test` → `all checks passed` (74 checks), including hand-counted: pairs
  `[{a.ts, b.ts, together:1, aCommits:1, bCommits:1}]`; coupling population
  `{eligible:1, single:4, oversize:0}` and, in the bulk-edit fixture,
  `{eligible:2, single:1, oversize:2}` with the 11- and 31-file commits excluded from
  pairs but still churning (45 files); median 1 / 3; rhythm hour-9 column
  `[1,1,1,1,1,1,0]` summing to `h.commits`; flux `{2024, active:2, fresh:2}` running to
  the current year; matrix diagonal `null`, cells mirroring pair counts; the at-risk
  badge fires (`"at risk · last commit 2024-03"`).
- Break-one: eligibility `>=2 → >=3` → 6 checks red; weekday `−1 → %7` → 1 check red;
  both reverted, suite green. (A first hour-parse sabotage was a no-op — `Number(" 09")`
  parses — so it was replaced with a real behavioral break.)
- Real specimen (megatix, 31k commits, 10 years): builds in 0.74s, 73–82 KB,
  `validateViewSpec ok=true errors=0 warnings=0`, `registry 22 names used, 176 known,
  0 unresolved`.
- Rendered per rule 12 (`history` + `preview` + playwright screenshots): coupling table
  with real pairs (ArtspayController↔ArtspayForm 12× at 70.6%), co-change matrix with
  visible clusters and null diagonal, 7×24 rhythm heatmap with business-hours block and
  legend, knowledge risk with "single owner" flags (megatix) and "at risk · last commit
  2023-01" ghosts (evtstore, dead repo), flux showing 3→0 authors, six tabs wrapped and
  all reachable. Render fixes made along the way: dropped a 36px-crushed meter column,
  dropped a clipped badge column + repeating "shared" chips (badge folded under author,
  exceptional tiers only, `scrollWidth` overflow re-measured to 0), tab bar wrapped.
- Empty window (`--since 2099`): valid document, no NaN (tested); single-commit repo:
  CLI exit 0, no plural slips (regex extended with years/pairs), which caught and fixed
  a real `"1 are merges"` prose bug.
- Documents and preview copies removed after verification; server stopped.
- Incident during adversarial verification: dashboard/history.ts was reverted to HEAD on
  disk mid-review (all dependent files intact), breaking typecheck and tests. The final
  implementation was restored from the working context; the full gate suite was then
  re-run green: typecheck clean, 74/74 checks, megatix build
  `validateViewSpec ok=true / registry 22 used, 176 known, 0 unresolved`, 73.6 KB.
- Verifier finding adopted: tests now validate through the shared registry AND contracts
  (`validateViewSpec(spec, { registry, contracts })`), the same options the gate passes,
  instead of the bare defaults.
- Adversarial verdicts: all seven staked checks SURVIVE across four independent lenses
  (literal re-run, edge probes, spirit-vs-request, cold read), including an independent
  re-render measuring 0px table overflow on every tab at 1280 and 820 widths, a
  "Heetmap" typo probe proving the validator's registry option is live, and timezone
  boundary probes (±13h offsets, Sunday 00:00/23:59) bucketing correctly.
- Edge findings adopted and fixed after the verdicts: `tailNote`'s singular slip
  ("the 1 older are not listed") — moved beside `capNote` in the shared format module,
  verb now rides the count, unit-tested at the boundary; the stale gate header comment;
  and the disclosure walker now requires N notes for N tables in one array. All gates
  re-run green after the fixes (74+ checks, megatix build clean).
