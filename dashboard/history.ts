/**
 * Repo history as one ViewSpec document — five questions a `git log` can answer.
 *
 *   bun run history [-o out.json | --stdout] [--repo path] [--since "1 year ago"] [--top N]
 *
 * The shell one-liners this replaces end in `sort | uniq -c | sort -nr | head -20`, which
 * throws away the population before anything can say what was cut. Every tally here is
 * counted in-process from the full output, so a top-N table can state its own remainder.
 */
import { basename } from "node:path";
import type { ViewNode, ViewSpec } from "@batthewz/response-ui-renderer/spec";
import { gateAndEmit, outPathArg } from "./gate.ts";
import { DEEP_OCEAN, themedPage } from "./theme.ts";
import { fail, say } from "../src/report.ts";
import {
  capNote,
  card,
  cell,
  countOf,
  excerpt,
  meter,
  muted,
  n,
  pct,
  share,
  sparkline,
  stack,
  statTile,
  table,
  tabsNode,
  text,
  utcDate,
} from "./format.ts";

/** Subject-line words that mark a commit as unplanned work. The shell version greps
 *  `git log --oneline`, which prints the subject and nothing else, so body text is out
 *  of scope here too. */
const FIREFIGHT = /revert|hotfix|emergency|rollback/i;

// Layout constants. Deliberately the only bare numbers below.
const MONTH_ROWS = 12;
const TREND_MONTHS = 3;
const SUBJECT_CHARS = 96;
/** Percent of a file's commits that must be fix-flagged before the chip warns. */
const HEAVY_FIX_SHARE = 50;

export type FileChurn = { path: string; commits: number; fixes: number };
export type Month = { month: string; commits: number };
export type Firefight = { sha: string; date: string; author: string; subject: string };

export type History = {
  name: string;
  path: string;
  branch: string;
  head: string;
  since: string;
  generatedAt: number;
  /** `YYYY-MM` in local time, matching how git renders `%ad` for a commit made here. */
  nowMonth: string;
  /** Every count below except `months` is bounded by `since`; `months` is all history. */
  commits: number;
  merges: number;
  fixCommits: number;
  files: FileChurn[];
  touches: number;
  authors: Array<{ name: string; commits: number }>;
  months: Month[];
  fires: Firefight[];
};

function git(repo: string, args: string[]): string {
  // `stdin: "ignore"` matters beyond tidiness: several git subcommands read stdin when it
  // is not a terminal — `git shortlog` with no revision range silently reports nothing.
  const r = Bun.spawnSync(["git", "-C", repo, "-c", "core.quotePath=false", ...args], {
    stdin: "ignore",
  });
  if (!r.success) {
    const why = r.stderr.toString().trim() || `exit ${r.exitCode}`;
    throw new Error(`git ${args.join(" ")}: ${why}`);
  }
  return r.stdout.toString();
}

/** Non-empty lines, untrimmed — a leading space is a legal filename. */
const lines = (out: string): string[] => out.split("\n").filter((l) => l.length > 0);

function tally(items: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1);
  return counts;
}

/** Ranked by count, ties broken by name — git's own order is by commit date, which
 *  reshuffles equal-count rows every time a commit lands. */
const ranked =
  <T extends { commits: number }>(name: (t: T) => string) =>
  (a: T, b: T): number =>
    b.commits - a.commits || (name(a) < name(b) ? -1 : name(a) > name(b) ? 1 : 0);

/**
 * A month with no commit is a data point, not a gap. Left out, a two-year silence renders
 * as two adjacent bars and the trajectory reads as continuous activity.
 *
 * The series runs to `through` — today — rather than to the last commit, because a repo
 * that stopped six months ago is the clearest "dying" signal there is and it lives
 * entirely in the months after the final commit.
 */
export function fillMonths(counts: Map<string, number>, through: string): Month[] {
  const keys = [...counts.keys()].sort();
  const first = keys[0];
  const last = keys[keys.length - 1];
  if (first === undefined || last === undefined) return [];
  // A commit stamped in a timezone ahead of this machine can sit past `through`.
  const [endY, endM] = (last > through ? last : through).split("-").map(Number) as [number, number];
  let [y, m] = first.split("-").map(Number) as [number, number];
  const out: Month[] = [];
  while (y < endY || (y === endY && m <= endM)) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    out.push({ month: key, commits: counts.get(key) ?? 0 });
    if (++m > 12) ((m = 1), y++);
  }
  return out;
}

export function collect(repoArg: string, since: string): History {
  const now = new Date();
  const nowMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const path = git(repoArg, ["rev-parse", "--show-toplevel"]).trim();
  if (git(repoArg, ["rev-list", "-n", "1", "--all"]).trim() === "") {
    throw new Error(`${path} has no commits yet`);
  }
  const sinceArg = [`--since=${since}`];

  const churn = tally(lines(git(path, ["log", ...sinceArg, "--format=format:", "--name-only"])));
  const fixes = tally(
    lines(
      git(path, [
        "log",
        ...sinceArg,
        "-i",
        "-E",
        "--grep=fix|bug|broken",
        "--format=format:",
        "--name-only",
      ]),
    ),
  );
  const files = [...churn].map(([p, commits]) => ({
    path: p,
    commits,
    fixes: fixes.get(p) ?? 0,
  }));

  const commits = lines(git(path, ["log", ...sinceArg, "--format=%H"])).length;
  const nonMerge = lines(git(path, ["log", ...sinceArg, "--no-merges", "--format=%H"]));
  const fixCommits = lines(
    git(path, ["log", ...sinceArg, "-i", "-E", "--grep=fix|bug|broken", "--format=%H"]),
  ).length;

  // `%aN` resolves .mailmap, so one contributor with two addresses is one row — the same
  // identity `git shortlog -sn` reports.
  const authors = [...tally(lines(git(path, ["log", ...sinceArg, "--no-merges", "--format=%aN"])))]
    .map(([name, count]) => ({ name, commits: count }))
    .sort(ranked((a) => a.name));

  // All history, unlike everything above: "accelerating or dying" is a question about the
  // shape of the whole life of the repo, and a windowed answer cannot show a decline.
  const months = fillMonths(
    tally(lines(git(path, ["log", "--format=%ad", "--date=format:%Y-%m"]))),
    nowMonth,
  );

  const fires: Firefight[] = lines(
    git(path, ["log", ...sinceArg, "--format=%h%x1f%ad%x1f%aN%x1f%s", "--date=short"]),
  )
    .map((line) => {
      const [sha = "", date = "", author = "", subject = ""] = line.split("\x1f");
      return { sha, date, author, subject };
    })
    .filter((c) => FIREFIGHT.test(c.subject));

  return {
    name: basename(path) || path,
    path,
    branch: git(path, ["rev-parse", "--abbrev-ref", "HEAD"]).trim(),
    head: git(path, ["rev-parse", "--short", "HEAD"]).trim(),
    since,
    generatedAt: now.getTime(),
    nowMonth,
    commits,
    merges: commits - nonMerge.length,
    fixCommits,
    files: files.sort(ranked((f) => f.path)),
    touches: [...churn.values()].reduce((a, b) => a + b, 0),
    authors,
    months,
    fires,
  };
}

const mean = (ms: Month[]): number =>
  ms.length === 0 ? 0 : ms.reduce((a, m) => a + m.commits, 0) / ms.length;

/**
 * The trajectory claim, or `undefined` when the history is too short to make one.
 *
 * The month in progress is excluded from both halves. A partial month always looks like a
 * collapse, and on the 5th of the month it would report a dying project every time.
 */
export function trendLine(months: Month[], nowMonth: string): string | undefined {
  const complete = months.filter((m) => m.month < nowMonth);
  if (complete.length < TREND_MONTHS * 2) return undefined;
  const recent = mean(complete.slice(-TREND_MONTHS));
  const prior = mean(complete.slice(-TREND_MONTHS * 2, -TREND_MONTHS));
  const window = `${TREND_MONTHS} complete months`;
  const pair =
    `${recent.toFixed(1)} commits/month over the last ${window}, ` +
    `against ${prior.toFixed(1)} over the ${TREND_MONTHS} before that`;
  if (recent === 0 && prior === 0) return `No commits in the last ${TREND_MONTHS * 2} months.`;
  if (prior === 0) return `${pair} — restarted from a standing stop.`;
  const change = Math.round(((recent - prior) / prior) * 100);
  const verdict = change >= 25 ? "accelerating" : change <= -25 ? "slowing" : "steady";
  return `${pair} — ${change >= 0 ? "+" : ""}${change}%, ${verdict}.`;
}

const barCell = (value: number, max: number, label: string): ViewNode =>
  cell([meter(pct(value, max), label)]);

/** `capNote` for a table ordered by recency rather than by rank, where "the top 12"
 *  names the wrong twelve. */
const tailNote = (shown: number, total: number, unit: string): string =>
  total <= shown
    ? `All ${countOf(total, unit, `${unit}s`)}.`
    : `The most recent ${n(shown)} of ${countOf(total, unit, `${unit}s`)}; ` +
      `the ${n(total - shown)} older are not listed.`;

/**
 * How much of a file's traffic is repair work.
 *
 * `statusLabel` is the visually-hidden word read before the number, and the variant's own
 * ("Information", "Warning") says nothing a reader can act on when it repeats down a
 * column. Empty drops it; the tier that is actually worth hearing says why it is that tier.
 */
function fixBadge(f: FileChurn): ViewNode {
  const heavy = pct(f.fixes, f.commits) >= HEAVY_FIX_SHARE;
  return {
    component: "Badge",
    props: {
      variant: f.fixes === 0 ? "default" : heavy ? "warning" : "info",
      statusLabel: heavy ? "most of its commits are fixes" : "",
    },
    children: [`${n(f.fixes)} · ${share(f.fixes, f.commits)}`],
  };
}

function churnTab(h: History, top: number): ViewNode[] {
  const rows = h.files.slice(0, top);
  const max = rows[0]?.commits ?? 0;
  const cut = h.files.slice(top).reduce((a, f) => a + f.commits, 0);
  return [
    muted(
      "Files ranked by the number of commits that touched them. A merge commit introduces " +
        "no file of its own and is absent from every row.",
    ),
    table(
      ["File", "Commits", "", "Fix commits · share"],
      rows.map((f) => [
        cell([text([f.path], { variant: "body-3" })]),
        cell([n(f.commits)]),
        barCell(f.commits, max, `${f.path}: ${countOf(f.commits, "commit", "commits")}`),
        cell([fixBadge(f)]),
      ]),
      { striped: true },
    ),
    muted(
      capNote(rows.length, h.files.length, "file", `${share(cut, h.touches)} of all file touches`),
    ),
  ];
}

function bugTab(h: History, top: number): ViewNode[] {
  const byFixes = h.files
    .filter((f) => f.fixes > 0)
    .sort((a, b) => b.fixes - a.fixes || (a.path < b.path ? -1 : 1));
  const rows = byFixes.slice(0, top);
  const max = rows[0]?.fixes ?? 0;
  const totalFixTouches = byFixes.reduce((a, f) => a + f.fixes, 0);
  const cut = byFixes.slice(top).reduce((a, f) => a + f.fixes, 0);
  return [
    muted(
      `${countOf(h.fixCommits, "commit", "commits")} of ${n(h.commits)} in this window say ` +
        "fix, bug or broken. That wording is a proxy for defect work, not a defect count: a " +
        "file can rank here for being touched by every fix rather than for causing any.",
    ),
    byFixes.length === 0
      ? muted("No commit in this window matches those words.")
      : table(
          ["File", "Fix commits", "", "All commits · share"],
          rows.map((f) => [
            cell([text([f.path], { variant: "body-3" })]),
            cell([n(f.fixes)]),
            barCell(f.fixes, max, `${f.path}: ${countOf(f.fixes, "fix commit", "fix commits")}`),
            cell([`${n(f.commits)} · ${share(f.fixes, f.commits)}`]),
          ]),
          { striped: true },
        ),
    muted(
      capNote(rows.length, byFixes.length, "file", `${share(cut, totalFixTouches)} of fix touches`),
    ),
  ];
}

function authorTab(h: History, top: number): ViewNode[] {
  const rows = h.authors.slice(0, top);
  const max = h.authors[0]?.commits ?? 0;
  const total = h.authors.reduce((a, x) => a + x.commits, 0);
  const cut = h.authors.slice(top).reduce((a, x) => a + x.commits, 0);
  return [
    muted(
      `Non-merge commits on ${h.branch}, by the identity .mailmap resolves — the ` +
        `${countOf(h.merges, "merge commit", "merge commits")} in this window are excluded.`,
    ),
    table(
      ["Author", "Commits", "", "Share"],
      rows.map((a) => [
        cell([a.name]),
        cell([n(a.commits)]),
        barCell(a.commits, max, `${a.name}: ${countOf(a.commits, "commit", "commits")}`),
        cell([`${share(a.commits, total)}`]),
      ]),
      { striped: true },
    ),
    muted(capNote(rows.length, h.authors.length, "author", `${share(cut, total)} of the commits`)),
  ];
}

function fireTab(h: History, top: number): ViewNode[] {
  const note = muted(
    "Commits whose subject says revert, hotfix, emergency or rollback — work that was not " +
      "the plan. Message bodies are not searched: the shell original greps git log " +
      "--oneline, which prints subjects only. Merges count, so one hotfix branch can appear " +
      "several times, once per branch it was merged into.",
  );
  if (h.fires.length === 0) {
    return [note, muted(`None of the ${countOf(h.commits, "commit", "commits")} in this window.`)];
  }
  return [
    note,
    table(
      ["Date", "Commit", "Author", "Subject"],
      h.fires
        .slice(0, top)
        .map((f) => [
          cell([f.date], { className: "whitespace-nowrap" }),
          cell([text([f.sha], { variant: "body-3" })]),
          cell([f.author]),
          cell([text([excerpt(f.subject, SUBJECT_CHARS)], { variant: "body-3" })]),
        ]),
      { striped: true },
    ),
    muted(
      `${share(h.fires.length, h.commits)} of the commits in this window — ` +
        `${countOf(h.fires.length, "commit", "commits")} of ${n(h.commits)}. ` +
        tailNote(Math.min(top, h.fires.length), h.fires.length, "commit"),
    ),
  ];
}

function trajectory(h: History): ViewNode {
  const shown = h.months.slice(-MONTH_ROWS);
  const max = h.months.reduce((a, m) => Math.max(a, m.commits), 0);
  const claim = trendLine(h.months, h.nowMonth);
  const total = h.months.reduce((a, m) => a + m.commits, 0);
  const active = h.months.filter((m) => m.commits > 0).length;
  return card([
    stack(
      [
        text(["Is this project accelerating or dying?"], { variant: "h3" }),
        muted(
          `All ${countOf(h.months.length, "month", "months")} since the first commit, ` +
            `${n(active)} of them with a commit — unlike every other block here, this one ` +
            "ignores the window.",
        ),
        claim === undefined
          ? muted(
              `Fewer than ${TREND_MONTHS * 2} complete months of history — too short to call ` +
                "a direction.",
            )
          : text([claim]),
        sparkline(
          h.months.map((m) => m.commits),
          `Commits per month, ${h.months[0]?.month} to ${h.months[h.months.length - 1]?.month}`,
          { variant: "bar" },
        ),
        table(
          ["Month", "Commits", ""],
          shown.map((m) => [
            cell([m.month === h.nowMonth ? `${m.month} (in progress)` : m.month]),
            cell([n(m.commits)]),
            barCell(m.commits, max, `${m.month}: ${countOf(m.commits, "commit", "commits")}`),
          ]),
          { striped: true },
        ),
        muted(
          `${tailNote(shown.length, h.months.length, "month")} Bars are scaled to the busiest ` +
            `month of all time (${n(max)}), so the table and the chart above share one scale. ` +
            `${n(total)} commits over all ${n(h.months.length)} months, against the ` +
            `${n(h.commits)} in the window every other block counts.`,
        ),
      ],
      "r4",
    ),
  ]);
}

export function buildHistorySpec(h: History, top: number): ViewSpec {
  const window = `since ${h.since}`;
  return {
    version: 1,
    title: `Repo history — ${h.name}`,
    description: `${n(h.commits)} commits ${window}, ${countOf(h.authors.length, "author", "authors")}.`,
    themeOverrides: DEEP_OCEAN,
    root: themedPage([
      {
        component: "Container",
        props: { size: "xl" },
        children: [
          stack([
            stack(
              [
                text([`Repo history — ${h.name}`], { variant: "h1" }),
                muted(
                  `${h.path} · ${h.branch} @ ${h.head} · window: ${window} · ` +
                    `read ${utcDate(h.generatedAt)}`,
                ),
              ],
              "r6",
            ),
            h.commits === 0
              ? {
                  component: "Alert",
                  props: { variant: "warning" },
                  children: [
                    `No commit falls ${window}, so every count on this page except the ` +
                      "trajectory is zero. Widen it with --since.",
                  ],
                }
              : {
                  component: "Grid",
                  props: { columns: 4, gap: "r4" },
                  children: [
                    statTile(
                      "Commits",
                      n(h.commits),
                      `${window} · ${countOf(h.merges, "merge", "merges")}`,
                    ),
                    statTile(
                      "Authors",
                      n(h.authors.length),
                      `${n(h.commits - h.merges)} non-merge commits`,
                    ),
                    statTile("Files touched", n(h.files.length), `${n(h.touches)} file touches`),
                    statTile(
                      "Firefighting",
                      share(h.fires.length, h.commits),
                      `${countOf(h.fires.length, "revert/hotfix", "reverts/hotfixes")}`,
                    ),
                  ],
                },
            trajectory(h),
            card([
              tabsNode([
                {
                  value: "churn",
                  label: "What changes most",
                  body: churnTab(h, top),
                },
                {
                  value: "bugs",
                  label: "Where bugs cluster",
                  body: bugTab(h, top),
                },
                {
                  value: "authors",
                  label: "Who built this",
                  body: authorTab(h, top),
                },
                { value: "fire", label: "Firefighting", body: fireTab(h, top) },
              ]),
            ]),
            muted(
              "Every figure is counted from the whole git log rather than from a head -20, " +
                "so each table can say what it left out.",
            ),
          ]),
        ],
      },
    ]),
  };
}

const USAGE =
  'usage: bun run history [-o out.json | --stdout] [--repo path] [--since "1 year ago"] [--top N]';

function main(argv: string[]): void {
  const flag = (name: string, fallback: string): string => {
    const i = argv.indexOf(name);
    if (i < 0) return fallback;
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("-")) {
      fail(`${name} requires a value\n${USAGE}`);
      process.exit(2);
    }
    return value;
  };

  const outPath = outPathArg(argv, USAGE, "history.blob.json");
  const repo = flag("--repo", process.cwd());
  const since = flag("--since", "1 year ago");
  const top = Number(flag("--top", "20"));
  if (!Number.isInteger(top) || top < 1) {
    fail(`--top needs a whole number >= 1\n${USAGE}`);
    process.exit(2);
  }

  let history: History;
  try {
    history = collect(repo, since);
  } catch (e) {
    fail(`${e instanceof Error ? e.message : String(e)}\n${USAGE}`);
    process.exit(2);
  }
  say(
    `${history.path} · ${history.commits} commit(s) since ${since} · ` +
      `${history.files.length} file(s) · ${history.authors.length} author(s) · ` +
      `${history.months.length} month(s) of history`,
  );

  gateAndEmit(buildHistorySpec(history, top), outPath);
}

if (import.meta.main) main(process.argv.slice(2));
