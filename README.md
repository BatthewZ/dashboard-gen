# In Short

This project was inspired by blog post [The Git Commands I Run Before Reading Any Code](https://piechowski.io/post/git-commands-before-reading-code/).

It runs essentially runs some git commands on a local repo of your choosing, and injects the output into a [Response UI Renderer](https://batthewz.github.io/response-ui-renderer/?page=playground) ViewSpec

**The git commands are, more or less:**

`git log --format=format: --name-only --since="1 year ago" | sort | uniq -c | sort -nr | head -20`

`git shortlog -sn --no-merges`

`git log -i -E --grep="fix|bug|broken" --name-only --format='' | sort | uniq -c | sort -nr | head -20`

`git log --format='%ad' --date=format:'%Y-%m' | sort | uniq -c`

`git log --oneline --since="1 year ago" | grep -iE 'revert|hotfix|emergency|rollback'`

Plus three the shell versions cannot compose at all: a commit-grouped
`git log --format=$'\x1e%H\x1f%aN' --name-only` pass that keeps the commit boundary — which
is what temporal coupling, per-file ownership and commit shape are counted from — and
`--date=format:'%u %H'` / `--date=format:'%Y-%m'` passes that bucket every commit by
author-local weekday × hour and by author per month.

# dashboard-gen

Every repository is already keeping a detailed record of how it was built. You just can't
read it. `git log` will tell you which files churn, which ones keep getting fixed, who
actually wrote this thing and whether the whole project is speeding up or quietly dying —
but only through one-liners that end in `sort | uniq -c | sort -nr | head -20`, which throw
the population away before anything can tell you what was cut.

This turns that log into a page:

```bash
bun install
bun run history      # any repo's git log → history.blob.json
bun run preview      # → http://localhost:8787
```

Two commands with no arguments. `history` reads the repository you're standing in and
writes `history.blob.json`; `preview` opens that file by default, so the pair composes with
nothing to remember.

**You should see** `history` report what it read, then both gates pass, then where it
wrote:

```
/home/you/code/thing · 4165 commit(s) since 1 year ago · 4491 file(s) · 7 author(s) · 125 month(s) of history
validateViewSpec  ok=true  errors=0  warnings=0
registry          22 names used, 176 known, 0 unresolved

76.7 KB → history.blob.json
look at it:  bun run preview history.blob.json
```

That is a real run over a ten-year, 25,000-commit repository: under a second, and 77 KB
out, because every table is capped and says what it cut.

Then `preview` compiles CSS, bundles the host, and serves:

```
history.blob.json → http://localhost:8787
This page carries verbatim commit messages and is served to localhost only. Ctrl-C to stop.
```

Open that URL and you get a dark page headed **Repo history — thing**: four tiles, a
trajectory card, then seven tabs.

That report is on **stdout** — it is progress, not an error, and a terminal that paints
stderr red would say otherwise. Failures go to stderr: a bad flag, a path that is not a
repository, a gate that refused to write. Ask for `--stdout` and the whole report moves to
stderr instead, because the document is the payload then and nothing else may share the
stream.

### Looking at a repo you aren't in

```bash
bun run history --repo ~/code/other-thing --since "6 months ago"
bun run preview history.blob.json
```

### If it didn't work

| What you see                                          | Why                                           | Fix                                                    |
| ----------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------ |
| `not a git repository`                                | `--repo` points outside a repo                | Any path _inside_ the repository works                 |
| `has no commits yet`                                  | Fresh `git init`                              | Nothing to read until the first commit                 |
| `No commit falls since …` on the page                 | The window is narrower than the repo is quiet | `bun run history --since "5 years ago"`                |
| `No commit falls since 1970-…` on a repo with commits | East of UTC, epoch-day midnight parses to a negative timestamp git reads as "after everything" | Any post-epoch date works: `--since 2000-01-01`        |
| `error: Failed to start server. Is port 8787 in use?` | A preview is already running                  | `bun run preview --port 8788`                          |
| `no such file: history.blob.json`                     | You ran `preview` before `history`            | Build the document first — the error names the command |
| A module resolution error naming `@batthewz/…`        | No `node_modules`                             | `bun install`                                          |
| `dashboard gate FAILED — not writing output`          | A real defect in the document                 | See [When the gate fails](#when-the-gate-fails)        |

---

## What the page answers

| Block                     | Answers                                                                                                                                                        |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Trajectory**            | Commits per month for the whole life of the repo, with a direction called from the last six _complete_ months                                                  |
| **What changes most**     | Files ranked by commits that touched them, each with the share of those commits that were fixes                                                                |
| **Where bugs cluster**    | The same files ranked by fix-flagged commits — messages matching `fix`, `bug` or `broken`                                                                      |
| **What changes together** | File pairs that co-change in one commit — counted over commits touching 2–10 files — with confidence against the rarer file, and a co-change matrix of the strongest cluster |
| **Who built this**        | Non-merge commits per author with their all-history active span, and **contributor flux** — active and first-time authors per year                              |
| **Who knows what**        | **Knowledge risk** — files where one author holds 70%+ and has gone quiet — and a per-author tracker: each author's files, with their share of the file and the file's share of their work |
| **How work lands**        | A weekday × hour heatmap of commits in author-local time, weekend and off-hours shares, and commit shape: median files per commit, mega-commits, the biggest commits |
| **Firefighting**          | Commits whose subject says revert, hotfix, emergency or rollback, and what share of the window they are                                                        |

### Three things that will mislead you if you skim

- **Only the trajectory ignores `--since`.** Every other figure is bounded by the window,
  which is what makes the churn and bug columns comparable to each other. A decline is
  invisible inside a window — the months after the last commit are the clearest death
  signal there is, and a windowed series is exactly where they're missing — so the month
  series is always all-history, and the block says so in its own first line.
- **Fix-flagged is a word match, not a defect count.** `hotfix` contains `fix`. A file can
  rank near the top for being _touched by_ every fix rather than for causing one, and a
  team whose convention is `chore: fix typo` will rank its changelog first. The page prints
  the matching rule and the population beside the number for this reason.
- **The month in progress is excluded from the trend** and labelled in the table. A partial
  month always looks like a collapse, so including it would report a dying project every
  time you ran this on the 3rd.
- **"At risk" means inactive here, not gone.** Knowledge risk calls an author inactive
  from their last commit *in this repo*; they may be busy in a sibling repo the page
  cannot see. Likewise the work-rhythm clock is the author date in the commit's own
  timezone — a rebase or squash-merge re-stamps it, so it is a proxy for when work
  happened, not a timesheet. Both blocks say so on the page.

Every tally is counted in-process from the full `git log` output rather than from a
`head -20`, so each table states its own remainder — what it cut, how many rows, and what
share of the quantity it was ranking.

> **The document is written `0600` and `*.blob.json` is gitignored.** It carries commit
> subjects verbatim, so it is exactly as sensitive as the repository it was built from.
> `preview` serves it to localhost only. A ViewSpec is nested JSON meant for a renderer and
> is not readable as a file — `preview` exists because looking at it any other way tells you
> nothing.

---

## Command reference

### `bun run history`

```
bun run history [-o out.json | --stdout] [--repo path] [--since "1 year ago"] [--top N]
```

| Flag             | Default             | Effect                                                                       |
| ---------------- | ------------------- | ---------------------------------------------------------------------------- |
| `-o <path>`      | `history.blob.json` | Where to write. Refuses a value that is itself a flag                        |
| `--stdout`       | off                 | Write the document to stdout instead of a file                               |
| `--repo <path>`  | current directory   | Any path inside the repository                                               |
| `--since <expr>` | `1 year ago`        | Anything `git log --since` accepts. Bounds every block except the trajectory |
| `--top N`        | `20`                | Rows per table. Whatever is cut is stated under it                           |

Exits `2` on a path that is not a repository, a repository with no commits, or a `--top` it
cannot rank by. Exits `1` without writing when the gate fails.

### `bun run preview`

```
bun run preview [doc.blob.json] [--port N]
```

Defaults to `history.blob.json` on port `8787`.

---

## How it works, and why

### Every figure is derived

Tiles, tables, meters and sparklines all come from one pass over `git log`. Nothing on the
page is typed by hand — layout constants are the only bare numbers in the builder. This is
a rule rather than a habit: the hand-written first draft of a page like this shipped four
plausible arithmetic errors.

Deriving a figure isn't enough on its own, either, because prose _around_ a derived figure
can still assert something the data contradicts. The trap this page walks closest to is
putting a windowed count and an all-history total in one sentence, where the reader
supplies a subset relation that doesn't hold — so the trajectory block names both totals
and says which is which.

### When the gate fails

Two checks run on every build, both fatal. A failing gate exits 1 and **writes nothing**.

| Gate                                                    | Catches                                                                                                                                                                     |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `validateViewSpec`, **errors and warnings**             | Enum typos, a `Dialog` with no literal `id`, forbidden props, over-deep nesting                                                                                             |
| Component names vs the **shared registry**              | The registry in [src/registry.ts](src/registry.ts) — the library plus this repo's own `Heatmap` — which the preview host renders with too, so the gate can never approve a name the host cannot draw |

Warnings are fatal on purpose: that tier is where authoring mistakes actually surface, so
passing on `ok` alone throws most of the tool away. It earned itself on the first run —
every `striped` table was rendering flat, because striping needs an `index` on each
`Table.Row` and the renderer's node wrapper hides a child's position from `Table.Body`.

Read the `ERROR`/`WARN`/`UNKNOWN` lines above the failure; each names the path in the
document.

### Why `preview` exists

The gates cannot see appearance. They check structure, and **every visual defect this code
has shipped passed both of them cleanly** — a palette that never reached the page floor,
sparklines drawn in invisible black, a table head rendering as a headerless band.

It is also the honest test of a utility class: it compiles Tailwind from the three CSS
layers alone and never points `@source` at the document, so a class resolves only if the
component library already ships it, exactly as in a real host.

### Theming

`spec.themeOverrides` re-points design tokens for one view, and the page commits to a full
deep-ocean palette from [`theme.ts`](dashboard/theme.ts) rather than re-tinting a brand.
That is a real bet, and worth understanding before copying it.

The palette and the node that paints the page floor live in that one module together,
because they only work as a pair — see the first trap below, which is what happens when a
page takes one without the other.

`themeOverrides` **cannot flip light ↔ dark**, because `color-scheme` is a CSS property and
no `--` key reaches it. Re-tinting only the brand is therefore safe in any host. Committing
to a dark palette means overriding every surface, text, border and status token so nothing
falls back to a host neutral — and accepting that whatever still follows `color-scheme`
does not follow you.

Measure that residue rather than assuming it. Here it is smaller than the warning implies:
the package paints scrollbars from `--C-BORDER-DEFAULT` rather than from the scheme, and
the page renders no native form control, so the input chrome that would have followed the
host is simply absent. A page with an `Input` on it would not get off so lightly.

Two traps a palette alone will not solve, both found by rendering the page rather than
reading it:

- **A custom property paints nothing.** `--C-CANVAS` only matters where some element carries
  `bg-canvas`, and the renderer's wrapper does not — so a dark palette rendered as dark cards
  stranded on the host's white page until the root node was given
  `className: "bg-canvas min-h-screen"`.
- **`Sparkline` marks use `var(--sparkline-color, currentColor)`,** and nothing defines that
  variable. On a plain layout wrapper `currentColor` is the browser default black, invisible
  on any dark surface. `className: "text-accent"` fixes it; `w-full` also makes it
  responsive, because its `width` prop is a viewBox number and the svg sets
  `preserveAspectRatio="none"`.

Leave the responsive scales alone — `--H1`–`--H6`, `--BodyText-*` and their line heights,
`--R-SIZE-*`, the weight tokens. They step up at a `40rem` media query, and an inline
override is one flat value at every width, which freezes that step.

---

## Reading conventions

A few things on the page mean something specific:

- **A meter is scaled against the top row**, not the column total — except in the trajectory
  table, where bars share one scale with the sparkline above them so the two can be read
  together. The note under each table says which.
- **`<0.1%`** is a real non-zero share below a tenth of a percent. `0%` means genuinely
  none, because "the 4 authors not listed hold 0% of the commits" would say they hold none.
- **A file's fix badge warns** only when at least half that file's commits are fix-flagged.
  The other tiers are coloured but say nothing a screen reader should announce.
- **The read timestamp is UTC**, with a trailing `Z`. Commit dates are git's own author
  dates, exactly as `git log` prints them for you.

---

## Development

```bash
bun run typecheck
bun run test
```

`test` builds real git repositories in a temp directory, commit by commit, and counts them
by hand. Canned `git log` output would test nothing but itself — and parsing that output is
the whole job. It also spawns the CLI for real and asserts on the files it leaves behind
and which stream said what, because every defect a user actually hit lived in the wrapper
rather than in the functions it wraps.

Before changing what the page looks like, read
[memory/viewspec-documents.md](memory/viewspec-documents.md) — what the gates do and don't
see, the token and utility traps that only appear in a browser, and why the only chart
component cannot label or be hovered. Before changing what it counts, read
[memory/git-history-metrics.md](memory/git-history-metrics.md) — including the git commands
that report nothing at all when a program rather than a person runs them.

| Path                                         | What it is                                                                        |
| -------------------------------------------- | --------------------------------------------------------------------------------- |
| [dashboard/history.ts](dashboard/history.ts) | Reads `git log`, builds the document, and is the CLI                              |
| [dashboard/format.ts](dashboard/format.ts)   | Formatting and ViewNode helpers every figure passes through                       |
| [dashboard/theme.ts](dashboard/theme.ts)     | The palette, and the node that makes it visible                                   |
| [dashboard/gate.ts](dashboard/gate.ts)       | The two checks, and the writer that runs after them                               |
| [src/registry.ts](src/registry.ts)           | The one registry and contracts both the gate and the host consume                 |
| [src/heatmap.tsx](src/heatmap.tsx)           | The `Heatmap` component — token-painted, so it follows any theme                  |
| [preview/](preview/)                         | The smallest host that proves a document paints                                   |
| [src/report.ts](src/report.ts)               | Which stream a diagnostic goes to                                                 |

A document that names `Heatmap` renders only on a host holding the shared registry. That
is the price of a component the library does not ship, and it is why the registry lives in
one module: the gate, the tests and the preview all import it, so they cannot disagree.
