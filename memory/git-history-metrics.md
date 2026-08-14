# Reading a repository's history as a metric source

`git log` is the cheapest evidence in any codebase and the easiest to misread. What follows
was established by building the churn / authorship / defect-cluster / trajectory /
firefighting page and checking every figure against the shell commands it replaces.

## The shell idiom throws away the population

`… | sort | uniq -c | sort -nr | head -20` cuts before anything can measure the cut. Tally
in-process from the full output instead: the same twenty rows, plus the remainder, so a
ranked table can state what it left out. The count you display and the count you disclose
must come from one pass over one population, or they will drift apart.

## git commands that lie when a program runs them

- **`git shortlog` reads stdin when stdin is not a terminal.** Invoked with no revision
  range from a subprocess it reports *nothing at all*, silently, and an authorship panel
  renders empty. Either pass an explicit revision, or ignore stdin, or count `%aN` from
  `git log` — which resolves `.mailmap` the same way and is one fewer special case.
- **`--since` filters on committer date; `%ad` prints author date.** A fixture that sets
  only `GIT_AUTHOR_DATE` has no window to test — every commit lands at whenever the suite
  ran. Set both, and know which date each figure is standing on.
- **`--since=1970-01-01` silently returns nothing east of UTC.** The date is parsed in
  local time, so on a UTC+N machine midnight of the epoch day lands *before* the epoch;
  the negative timestamp reads as "after everything" and the log comes back empty with no
  warning. "Since forever" must be spelled with a safely post-epoch date (`2000-01-01`),
  in tests and in any documented example alike.
- **Merge commits emit no filenames** under `--name-only`, so a file-churn tally is
  implicitly non-merge while a commit count is not. Say which population a number is from;
  authors summing to less than the commit total is otherwise read as a bug.
- **Paths are quoted** when they contain non-ASCII unless `core.quotePath=false`. A leading
  space is a legal filename, so filter blank lines by length rather than trimming.

## Windows, and the one figure that must escape them

Bounding every block by one window is what makes two tallies joinable — a fix-commit count
per file is only comparable to that file's commit count if both were counted over the same
commits. The exception is the trajectory: "is this accelerating or dying" cannot be
answered inside a window, because a decline is exactly what a window hides. Run the month
series over all history, put the two totals in one sentence rather than on facing tiles,
and name which is which.

Two things a month series must do or the shape is wrong: **fill silent months with zero**,
or a two-year gap renders as two adjacent bars; and **run to today rather than to the last
commit**, because the months after the final commit are the clearest death signal there is
and they are the ones absent from the data.

**Exclude the month in progress from any trend.** A partial month always looks like a
collapse, so a trend that includes it reports a dying project every time it runs early in
the month.

## Keeping the commit boundary

A flat `--name-only` tally can say how often each file changed and nothing about which
files changed *together* — the format that emits nothing per commit also emits no
separator, so the grouping is structurally gone before parsing starts. When an analysis
needs the commit as a unit (co-change pairs, files-per-commit shape, per-file ownership),
open each record with an explicit separator byte in the format string and let the file
list follow; split on the separator, take the first line as the header, and derive every
per-commit figure from those records so they are one population by construction. Put any
free-text field (the subject) in a separate flat pass joined by hash, so a hostile subject
can corrupt only its own field and never the record framing.

Co-change counting needs its population bounded and disclosed: a commit touching one file
carries no pair, and a bulk edit touching dozens pairs everything with everything and
means nothing pairwise. Exclude both ends, say so on the page with counts, and read a
pair's confidence against the rarer file's own count over that same bounded population —
mixing in the file's all-commits churn count makes the percentage a lie.

## An author is a string pair, not a person

Git records whatever `user.name`/`user.email` the committing device had, so one
contributor routinely appears as several identities — the same email under different
names (several devices) and the same name under different emails (a web UI's noreply
address). `.mailmap` fixes it per target repo, but a tool analyzing arbitrary repos
cannot rely on one existing: fold identities that share a non-empty name or a non-empty
email, transitively and case-insensitively, label the group with its most-used name, and
let `%aN`/`%aE` apply any mailmap first so an explicit mapping always wins. Two rules
keep the fold honest: an empty name or email is the absence of an identity and never
bridges anything, and identities with no shared field stay split even when a human can
guess they match — "Peter" and "Peter Hume" are only linkable by a mailmap, not by a
tool. Decide the fold over all history, not the window, so an author's rows cannot merge
or split as the window moves. And state the rule on the page: folding changes every
authorship figure, and an undisclosed identity rule reads as a bug when the raw log
disagrees.

## Which clock a date is on

`--date=format:` renders `%ad` in the timezone recorded on each commit — the author's own
clock — while `format-local:` silently converts to the machine's. For "when does work
happen" the commit's own clock is the honest axis, and it is still a proxy: rebases and
squash-merges re-stamp it. `%u` is ISO weekday, Monday first. Cross joins need the same
care as windows: judging an author inactive takes their last commit over *all* history,
while their commit count is windowed — two scales in one row, so the prose must name
which is which, and "inactive in this repo" must not be presented as "gone".

A year series inherits every month-series rule: fill silent years with zero, run to the
current year, and label the year in progress.

## Naming a proxy as a proxy

Every defect signal available here is a word match on a commit message. `hotfix` contains
`fix`. A file ranks in a bug-cluster table for being *touched by* fixes, which is not the
same as causing them, and a repo whose convention is "chore: fix typo" will rank its
changelog first. Put the population and the matching rule on the page next to the number;
a keyword tally presented as a defect count is the confidently-mislabelled figure this
repo's other notes warn about.

The same applies to firefighting: matching subjects only (which is what greping
`--oneline` does) means one hotfix branch appears once per merge, so the count is of
*events referencing unplanned work*, not of incidents.

## Sizes to expect before rendering

A decade-scale repo has thousands of revert-ish commits and tens of thousands of files. Any
table left uncapped is where a "lite" document becomes megabytes — the fix is the same cap
and the same disclosure every other table already uses. Cap by rank where the table is
ranked, and by recency where it is chronological; the word "top" names the wrong rows in a
list that is ordered by date.

Break count ties by name. Git's own order is by commit date, so equal-count rows reshuffle
every time anything lands, and a table that reorders between two runs of the same command
reads as a data change.
