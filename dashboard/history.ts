/**
 * Repo history as one ViewSpec document — the questions a `git log` can answer.
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
  heatmap,
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
  tailNote,
  text,
  utcDate,
} from "./format.ts";

/** Subject-line words that mark a commit as unplanned work. The shell version greps
 *  `git log --oneline`, which prints the subject and nothing else, so body text is out
 *  of scope here too. */
const FIREFIGHT = /revert|hotfix|emergency|rollback/i;

// Layout and threshold constants. Deliberately the only bare numbers below.
const MONTH_ROWS = 12;
const TREND_MONTHS = 3;
const SUBJECT_CHARS = 96;
/** Percent of a file's commits that must be fix-flagged before the chip warns. */
const HEAVY_FIX_SHARE = 50;
/** A commit touching more files than this is a bulk edit (rename, format, dependency
 *  bump) and evidence of nothing pairwise, so coupling excludes and discloses it. */
const MAX_COUPLING_FILES = 10;
/** Files in the co-change matrix. Past this a matrix stops being readable. */
const MATRIX_FILES = 12;
/** Percent of a file's commits one author must hold before the file has a single owner. */
const BUS_SHARE = 70;
/** Months without a commit anywhere in the repo before an owner counts as inactive. */
const GHOST_MONTHS = 6;
/** Years of contributor flux listed; older years are disclosed, not shown. */
const FLUX_YEARS = 6;
/** Author sub-tabs in the knowledge tracker — a tab bar stops being navigation past this. */
const AUTHOR_TABS = 8;
/** A commit touching more files than this is a mega-commit in the shape figures. */
const MEGA_FILES = 30;
const LARGEST_ROWS = 5;
/** Author-local working hours; commits outside them (or on Sat/Sun) are off-hours. */
const WORK_START = 8;
const WORK_END = 18;
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, "0"));
/** Characters of a path shown in matrix labels — the tail, where the basename lives. */
const MATRIX_LABEL_CHARS = 28;

export type FileChurn = {
  path: string;
  commits: number;
  fixes: number;
  /** Author with the most non-merge commits touching this file; ties break by name. */
  owner: string;
  ownerCommits: number;
};
export type Pair = {
  a: string;
  b: string;
  together: number;
  /** Each file's own count over the coupling-eligible commits, for confidence. */
  aCommits: number;
  bCommits: number;
};
export type Author = {
  name: string;
  commits: number;
  /** All-history months, merges included — activity, not windowed authorship. */
  firstMonth: string;
  lastMonth: string;
  /** Every file they touched in the window, by their non-merge commits touching it. */
  files: Array<{ path: string; commits: number }>;
};
export type Month = { month: string; commits: number };
export type FluxYear = { year: string; active: number; fresh: number };
export type BigCommit = { sha: string; date: string; subject: string; files: number };
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
  /** Every count below except `months` and `flux` is bounded by `since`. */
  commits: number;
  merges: number;
  fixCommits: number;
  files: FileChurn[];
  touches: number;
  pairs: Pair[];
  /** The coupling population: what was counted and what was set aside. */
  coupling: { eligible: number; single: number; oversize: number };
  authors: Author[];
  months: Month[];
  flux: FluxYear[];
  /** 7 rows (Mon–Sun) × 24 hours of windowed commits, author-local time. */
  rhythm: number[][];
  shape: { median: number; mega: number; largest: BigCommit[] };
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

const bump = (m: Map<string, number>, key: string): void => {
  m.set(key, (m.get(key) ?? 0) + 1);
};

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

/** Whole months from `a` to `b`, both `YYYY-MM`; positive when `b` is later. */
export function monthsBetween(a: string, b: string): number {
  const [ay, am] = a.split("-").map(Number) as [number, number];
  const [by, bm] = b.split("-").map(Number) as [number, number];
  return (by - ay) * 12 + (bm - am);
}

/** One windowed non-merge commit from the grouped pass. */
type GroupedCommit = { hash: string; author: string; files: string[] };

export function collect(repoArg: string, since: string): History {
  const now = new Date();
  const nowMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const path = git(repoArg, ["rev-parse", "--show-toplevel"]).trim();
  if (git(repoArg, ["rev-list", "-n", "1", "--all"]).trim() === "") {
    throw new Error(`${path} has no commits yet`);
  }
  const sinceArg = [`--since=${since}`];

  // One grouped pass keeps the commit boundary the flat `--name-only` tally discards:
  // \x1e opens each record, \x1f separates hash from author, files follow. Churn,
  // authorship, coupling, ownership and commit shape are all counted from these records,
  // so they are one population by construction.
  const records: GroupedCommit[] = git(path, [
    "log",
    ...sinceArg,
    "--no-merges",
    "--format=%x1e%H%x1f%aN",
    "--name-only",
  ])
    .split("\x1e")
    .map((chunk) => {
      const [header = "", ...files] = lines(chunk);
      const [hash = "", author = ""] = header.split("\x1f");
      return { hash, author, files };
    })
    .filter((r) => r.hash.length > 0);

  const churn = new Map<string, number>();
  const owners = new Map<string, Map<string, number>>();
  const authorTally = new Map<string, number>();
  const pairTally = new Map<string, number>();
  const eligibleTally = new Map<string, number>();
  let eligible = 0;
  let single = 0;
  let oversize = 0;
  for (const r of records) {
    bump(authorTally, r.author);
    for (const f of r.files) {
      bump(churn, f);
      const by = owners.get(f) ?? new Map<string, number>();
      owners.set(f, by);
      bump(by, r.author);
    }
    if (r.files.length === 1) {
      single++;
    } else if (r.files.length > MAX_COUPLING_FILES) {
      oversize++;
    } else if (r.files.length >= 2) {
      eligible++;
      const sorted = [...r.files].sort();
      for (const f of sorted) bump(eligibleTally, f);
      for (let i = 0; i < sorted.length; i++) {
        for (let j = i + 1; j < sorted.length; j++) {
          bump(pairTally, `${sorted[i]}\x1f${sorted[j]}`);
        }
      }
    }
  }

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
  const fixCommits = lines(
    git(path, ["log", ...sinceArg, "-i", "-E", "--grep=fix|bug|broken", "--format=%H"]),
  ).length;

  const files: FileChurn[] = [...churn].map(([p, commits]) => {
    let owner = "";
    let ownerCommits = 0;
    for (const [name, count] of owners.get(p) ?? []) {
      if (count > ownerCommits || (count === ownerCommits && name < owner)) {
        owner = name;
        ownerCommits = count;
      }
    }
    return { path: p, commits, fixes: fixes.get(p) ?? 0, owner, ownerCommits };
  });

  const confidence = (p: Pair): number => p.together / Math.min(p.aCommits, p.bCommits);
  const pairs: Pair[] = [...pairTally]
    .map(([key, together]) => {
      const [a = "", b = ""] = key.split("\x1f");
      return {
        a,
        b,
        together,
        aCommits: eligibleTally.get(a) ?? 0,
        bCommits: eligibleTally.get(b) ?? 0,
      };
    })
    .sort(
      (x, y) =>
        y.together - x.together ||
        confidence(y) - confidence(x) ||
        (x.a < y.a ? -1 : x.a > y.a ? 1 : x.b < y.b ? -1 : 1),
    );

  // Every commit in the window, merges included: the commit count, the firefight table,
  // the work-rhythm buckets and the subjects the shape table joins to. `%ad` with
  // `--date=format:` renders in each commit's own recorded timezone — the author's local
  // clock, which is the honest axis for "when does work happen".
  const all = lines(
    git(path, [
      "log",
      ...sinceArg,
      "--format=%H%x1f%h%x1f%aN%x1f%ad%x1f%s",
      "--date=format:%Y-%m-%d %u %H",
    ]),
  ).map((line) => {
    const [hash = "", sha = "", author = "", ad = "", ...rest] = line.split("\x1f");
    return {
      hash,
      sha,
      author,
      date: ad.slice(0, 10),
      weekday: Number(ad.slice(11, 12)),
      hour: Number(ad.slice(13, 15)),
      subject: rest.join("\x1f"),
    };
  });
  const commits = all.length;

  const rhythm: number[][] = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  for (const c of all) {
    if (c.weekday >= 1 && c.weekday <= 7 && c.hour >= 0 && c.hour <= 23) {
      const row = rhythm[c.weekday - 1]!;
      row[c.hour] = (row[c.hour] ?? 0) + 1;
    }
  }

  const fires: Firefight[] = all
    .filter((c) => FIREFIGHT.test(c.subject))
    .map(({ sha, date, author, subject }) => ({ sha, date, author, subject }));

  const byHash = new Map(all.map((c) => [c.hash, c]));
  const fileCounts = records.map((r) => r.files.length).sort((a, b) => a - b);
  const mid = fileCounts.length / 2;
  const median =
    fileCounts.length === 0
      ? 0
      : fileCounts.length % 2
        ? fileCounts[(fileCounts.length - 1) / 2]!
        : (fileCounts[mid - 1]! + fileCounts[mid]!) / 2;
  const largest: BigCommit[] = [...records]
    .sort((a, b) => b.files.length - a.files.length || (a.hash < b.hash ? -1 : 1))
    .slice(0, LARGEST_ROWS)
    .map((r) => {
      const c = byHash.get(r.hash);
      return {
        sha: c?.sha ?? r.hash.slice(0, 7),
        date: c?.date ?? "",
        subject: c?.subject ?? "",
        files: r.files.length,
      };
    });

  // All history, unlike everything above: the trajectory and the contributor flux are
  // questions about the shape of the whole life of the repo, and a windowed answer
  // cannot show a decline. One pass carries the month series, each author's first and
  // last month, and who was active in which year — merges included, since a merge is
  // still a person present.
  const life = lines(git(path, ["log", "--format=%aN%x1f%ad", "--date=format:%Y-%m"])).map(
    (line) => {
      const [author = "", month = ""] = line.split("\x1f");
      return { author, month };
    },
  );
  const months = fillMonths(
    tally(life.map((c) => c.month)),
    nowMonth,
  );
  const spans = new Map<string, { first: string; last: string }>();
  const activeByYear = new Map<string, Set<string>>();
  for (const c of life) {
    const s = spans.get(c.author);
    if (!s) {
      spans.set(c.author, { first: c.month, last: c.month });
    } else {
      if (c.month < s.first) s.first = c.month;
      if (c.month > s.last) s.last = c.month;
    }
    const year = c.month.slice(0, 4);
    const active = activeByYear.get(year) ?? new Set<string>();
    activeByYear.set(year, active);
    active.add(c.author);
  }
  const freshByYear = new Map<string, number>();
  for (const s of spans.values()) bump(freshByYear, s.first.slice(0, 4));
  // Years come from the zero-filled month series, so a silent year is a row, not a gap,
  // and the series runs to today for the same reason the months do.
  const flux: FluxYear[] = [...new Set(months.map((m) => m.month.slice(0, 4)))].map((year) => ({
    year,
    active: activeByYear.get(year)?.size ?? 0,
    fresh: freshByYear.get(year) ?? 0,
  }));

  // The per-file ownership map read the other way: which files each author touched.
  const filesByAuthor = new Map<string, Array<{ path: string; commits: number }>>();
  for (const [p, by] of owners) {
    for (const [name, count] of by) {
      const list = filesByAuthor.get(name) ?? [];
      filesByAuthor.set(name, list);
      list.push({ path: p, commits: count });
    }
  }
  for (const list of filesByAuthor.values()) list.sort(ranked((f) => f.path));

  // `%aN` resolves .mailmap, so one contributor with two addresses is one row — the same
  // identity `git shortlog -sn` reports.
  const authors: Author[] = [...authorTally]
    .map(([name, count]) => {
      const span = spans.get(name);
      // The all-history pass is a superset of the windowed one, so this cannot miss.
      if (!span) throw new Error(`author "${name}" is in the window but not in the history`);
      return {
        name,
        commits: count,
        firstMonth: span.first,
        lastMonth: span.last,
        files: filesByAuthor.get(name) ?? [],
      };
    })
    .sort(ranked((a) => a.name));

  return {
    name: basename(path) || path,
    path,
    branch: git(path, ["rev-parse", "--abbrev-ref", "HEAD"]).trim(),
    head: git(path, ["rev-parse", "--short", "HEAD"]).trim(),
    since,
    generatedAt: now.getTime(),
    nowMonth,
    commits,
    merges: commits - records.length,
    fixCommits,
    files: files.sort(ranked((f) => f.path)),
    touches: [...churn.values()].reduce((a, b) => a + b, 0),
    pairs,
    coupling: { eligible, single, oversize },
    authors,
    months,
    flux,
    rhythm,
    shape: { median, mega: records.filter((r) => r.files.length > MEGA_FILES).length, largest },
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

/** A path cell that yields: `overflow-wrap: anywhere` (inline — no utility ships for it)
 *  lets the table shrink the path column instead of pushing the verdict columns off-screen,
 *  and a break mid-path is legible where a clipped share is not. */
const pathCell = (path: string): ViewNode =>
  cell([text([path], { variant: "body-3" })], { style: { overflowWrap: "anywhere" } });

/** The tail of a path, where the basename lives — for labels a full path would drown. */
const pathTail = (p: string, max: number): string =>
  p.length <= max ? p : `…${p.slice(p.length - (max - 1))}`;

/** A file's whole-integer median reads as a count; a fractional one cannot. */
const medianLabel = (median: number): string =>
  Number.isInteger(median) ? countOf(median, "file", "files") : `${median.toFixed(1)} files`;

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

/** The co-change matrix: the files most often in a pair, against each other. */
function matrixNodes(h: History): ViewNode[] {
  const weight = new Map<string, number>();
  for (const p of h.pairs) {
    weight.set(p.a, (weight.get(p.a) ?? 0) + p.together);
    weight.set(p.b, (weight.get(p.b) ?? 0) + p.together);
  }
  const picked = [...weight]
    .sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1))
    .slice(0, MATRIX_FILES)
    .map(([f]) => f);
  // Two files make one pair the table above already shows better.
  if (picked.length < 3) return [];
  const index = new Map(picked.map((f, i) => [f, i]));
  const matrix: Array<Array<number | null>> = picked.map((_, r) =>
    picked.map((_, c) => (r === c ? null : 0)),
  );
  for (const p of h.pairs) {
    const i = index.get(p.a);
    const j = index.get(p.b);
    if (i !== undefined && j !== undefined) {
      matrix[i]![j] = p.together;
      matrix[j]![i] = p.together;
    }
  }
  const labels = picked.map((f) => pathTail(f, MATRIX_LABEL_CHARS));
  return [
    text(["The strongest cluster"], { variant: "h4" }),
    heatmap(
      matrix,
      labels,
      labels,
      `Commits together among the ${countOf(picked.length, "file", "files")} most often in a pair`,
      { verticalColLabels: true, unitOne: "commit together", unitMany: "commits together" },
    ),
    muted(
      `The ${countOf(picked.length, "file", "files")} most often in a pair, of the ` +
        `${countOf(weight.size, "file", "files")} in any pair; long paths keep their tail. ` +
        "Hover a cell for its count. Cells share one scale, anchored at the busiest pair.",
    ),
  ];
}

function coupleTab(h: History, top: number): ViewNode[] {
  const note = muted(
    `Pairs of files that changed in the same commit — counted over the ` +
      `${countOf(h.coupling.eligible, "non-merge commit", "non-merge commits")} touching 2 to ` +
      `${n(MAX_COUPLING_FILES)} files. Set aside: ${countOf(h.coupling.single, "commit", "commits")} ` +
      `touching one file (no pair to count), and ` +
      `${countOf(h.coupling.oversize, "commit", "commits")} touching more than ` +
      `${n(MAX_COUPLING_FILES)} — bulk edits like renames, formatting and dependency bumps ` +
      "pair everything with everything and mean nothing pairwise.",
  );
  if (h.pairs.length === 0) {
    return [note, muted("No two files changed in the same commit in this window.")];
  }
  const rows = h.pairs.slice(0, top);
  const totalTogether = h.pairs.reduce((a, p) => a + p.together, 0);
  const cut = h.pairs.slice(top).reduce((a, p) => a + p.together, 0);
  return [
    note,
    // No meter column: the two stacked paths leave a bar no room to be read, and a bar
    // too narrow to compare is decoration wearing data's clothes.
    table(
      ["Files · their own commits", "Together", "Of the rarer file"],
      rows.map((p) => [
        cell([
          text([`${p.a} · ${n(p.aCommits)}`], { variant: "body-3" }),
          text([`${p.b} · ${n(p.bCommits)}`], { variant: "body-3" }),
        ]),
        cell([n(p.together)]),
        // The pair count against the rarer file's own: 100% means one never moves alone.
        cell([share(p.together, Math.min(p.aCommits, p.bCommits))]),
      ]),
      { striped: true },
    ),
    muted(
      capNote(
        rows.length,
        h.pairs.length,
        "pair",
        `${share(cut, totalTogether)} of the co-changes`,
      ) +
        " “Of the rarer file” reads the pair count against the smaller of the two files’ " +
        "own counts over those same 2–10-file commits, so 100% means that file never " +
        "changes without the other.",
    ),
    ...matrixNodes(h),
  ];
}

function whoTab(h: History, top: number): ViewNode[] {
  const rows = h.authors.slice(0, top);
  const max = h.authors[0]?.commits ?? 0;
  const total = h.authors.reduce((a, x) => a + x.commits, 0);
  const cut = h.authors.slice(top).reduce((a, x) => a + x.commits, 0);

  const fluxShown = h.flux.slice(-FLUX_YEARS);
  const nowYear = h.nowMonth.slice(0, 4);

  return [
    muted(
      `Non-merge commits on ${h.branch}, by the identity .mailmap resolves — merges ` +
        `(${countOf(h.merges, "commit", "commits")} in this window) are excluded. ` +
        "First and last are the author's whole life in this repo, merges included, " +
        "unlike the windowed count beside them.",
    ),
    table(
      ["Author", "Commits", "", "Share", "First · last commit"],
      rows.map((a) => [
        cell([a.name]),
        cell([n(a.commits)]),
        barCell(a.commits, max, `${a.name}: ${countOf(a.commits, "commit", "commits")}`),
        cell([`${share(a.commits, total)}`]),
        cell([text([`${a.firstMonth} · ${a.lastMonth}`], { variant: "body-3" })]),
      ]),
      { striped: true },
    ),
    muted(capNote(rows.length, h.authors.length, "author", `${share(cut, total)} of the commits`)),

    text(["Contributor flux"], { variant: "h4" }),
    muted(
      "Who is arriving. An author is active in any year they committed — merges included, " +
        "the whole life of the repo rather than the window — and first-time in the year of " +
        "their first commit ever.",
    ),
    table(
      ["Year", "Active authors", "First-time"],
      fluxShown.map((y) => [
        cell([y.year === nowYear ? `${y.year} (in progress)` : y.year]),
        cell([n(y.active)]),
        cell([n(y.fresh)]),
      ]),
      { striped: true },
    ),
    muted(tailNote(fluxShown.length, h.flux.length, "year")),
  ];
}

/** One author's corner of the codebase: their files, with the share read both ways. */
function authorPanel(h: History, a: Author, top: number): ViewNode[] {
  const churnByPath = new Map(h.files.map((f) => [f.path, f.commits]));
  const rows = a.files.slice(0, top);
  const touches = a.files.reduce((s, f) => s + f.commits, 0);
  const cut = a.files.slice(top).reduce((s, f) => s + f.commits, 0);
  return [
    muted(
      `${countOf(a.commits, "non-merge commit", "non-merge commits")} across ` +
        `${countOf(a.files.length, "file", "files")} in this window; active ` +
        `${a.firstMonth} to ${a.lastMonth} over the repo's life. “Of theirs” is the share ` +
        "of their commits that land in the file; “of the file” is how much of the file is " +
        "theirs — the same share the knowledge-risk table flags.",
    ),
    table(
      ["File", "Commits", "Of theirs", "Of the file"],
      rows.map((f) => [
        pathCell(f.path),
        cell([n(f.commits)]),
        cell([share(f.commits, a.commits)]),
        cell([share(f.commits, churnByPath.get(f.path) ?? f.commits)]),
      ]),
      { striped: true },
    ),
    muted(
      capNote(
        rows.length,
        a.files.length,
        "file",
        `${share(cut, touches)} of their file touches`,
      ),
    ),
  ];
}

function knowTab(h: History, top: number): ViewNode[] {
  const knowledgeRows = h.files.slice(0, top);
  const lastByAuthor = new Map(h.authors.map((a) => [a.name, a.lastMonth]));
  const owned = (f: FileChurn): boolean => pct(f.ownerCommits, f.commits) >= BUS_SHARE;
  const idleMonths = (f: FileChurn): number =>
    monthsBetween(lastByAuthor.get(f.owner) ?? h.nowMonth, h.nowMonth);

  const shownAuthors = h.authors.slice(0, AUTHOR_TABS);
  const totalCommits = h.authors.reduce((s, a) => s + a.commits, 0);
  const cutCommits = h.authors.slice(AUTHOR_TABS).reduce((s, a) => s + a.commits, 0);

  return [
    text(["Knowledge risk"], { variant: "h4" }),
    muted(
      `The same files the churn tab ranks, by who holds their commits. A file is at risk ` +
        `when one author holds ${n(BUS_SHARE)}%+ of its commits and last committed anything ` +
        `in this repo ${countOf(GHOST_MONTHS, "month", "months")} or more ago. Inactivity ` +
        "here is a proxy for departure — the author may be busy in a repo this page cannot see.",
    ),
    // No badge column, and no badge at all on shared files: a "shared" chip down every
    // row says nothing, and the empty column it needs pushed the real flags off-screen.
    // The two tiers worth hearing about ride under the author, with the last-commit date
    // on the one badge it falsifies.
    table(
      ["File", "Commits", "Main author"],
      knowledgeRows.map((f) => {
        const idle = idleMonths(f);
        const risky = owned(f) && idle >= GHOST_MONTHS;
        return [
          pathCell(f.path),
          cell([n(f.commits)]),
          cell([
            text([`${f.owner} · ${share(f.ownerCommits, f.commits)}`], { variant: "body-3" }),
            ...(owned(f)
              ? [
                  {
                    component: "Badge",
                    props: {
                      variant: risky ? "warning" : "info",
                      statusLabel: risky ? "single knowledge holder, inactive" : "",
                    },
                    children: [
                      risky
                        ? `at risk · last commit ${lastByAuthor.get(f.owner) ?? h.nowMonth}`
                        : "single owner",
                    ],
                  } as ViewNode,
                ]
              : []),
          ]),
        ];
      }),
      { striped: true },
    ),
    muted(capNote(knowledgeRows.length, h.files.length, "file")),

    text(["Where each author works"], { variant: "h4" }),
    muted(
      "The same records read the other way: each author's files, ranked by their own " +
        "non-merge commits touching them. A commit touching three files counts toward " +
        "each of the three.",
    ),
    ...(shownAuthors.length === 0
      ? [muted("No author has a commit in this window.")]
      : [
          tabsNode(
            shownAuthors.map((a) => ({
              value: a.name,
              label: a.name,
              body: authorPanel(h, a, top),
            })),
            { variant: "pill" },
          ),
          muted(
            capNote(
              shownAuthors.length,
              h.authors.length,
              "author",
              `${share(cutCommits, totalCommits)} of the commits`,
            ),
          ),
        ]),
  ];
}

function workTab(h: History): ViewNode[] {
  const intro = muted(
    "When commits land, on the author's own clock — the timezone recorded on each commit. " +
      "A rebase or a squash-merge re-stamps that clock, so this is a proxy for when work " +
      "happens, not a timesheet. Every commit in the window counts, merges included.",
  );
  if (h.commits === 0) {
    return [intro, muted("No commit falls in this window.")];
  }
  const weekend = (h.rhythm[5] ?? []).concat(h.rhythm[6] ?? []).reduce((a, b) => a + b, 0);
  let off = 0;
  let peak = { day: 0, hour: 0, commits: 0 };
  h.rhythm.forEach((row, day) =>
    row.forEach((count, hour) => {
      if (day >= 5 || hour < WORK_START || hour >= WORK_END) off += count;
      if (count > peak.commits) peak = { day, hour, commits: count };
    }),
  );
  const shape = h.shape;
  const nonMerge = h.commits - h.merges;
  return [
    intro,
    heatmap(h.rhythm, WEEKDAYS, HOURS, "Commits by weekday and hour, author-local time", {
      unitOne: "commit",
      unitMany: "commits",
    }),
    muted(
      `${share(weekend, h.commits)} of the ${countOf(h.commits, "commit", "commits")} landed ` +
        `on a weekend, and ${share(off, h.commits)} outside ` +
        `Mon–Fri ${String(WORK_START).padStart(2, "0")}:00–${String(WORK_END).padStart(2, "0")}:00 ` +
        `author-local. The busiest hour is ${WEEKDAYS[peak.day]} ` +
        `${HOURS[peak.hour]}:00 with ${countOf(peak.commits, "commit", "commits")}.`,
    ),
    text(["Commit shape"], { variant: "h4" }),
    muted(
      `A median non-merge commit touches ${medianLabel(shape.median)}. ` +
        `${countOf(shape.mega, "commit", "commits")} of ` +
        `${countOf(nonMerge, "non-merge commit", "non-merge commits")} touched more than ` +
        `${countOf(MEGA_FILES, "file", "files")} (${share(shape.mega, nonMerge)}), and merges ` +
        `are ${countOf(h.merges, "commit", "commits")} of the window's ` +
        `${countOf(h.commits, "commit", "commits")} (${share(h.merges, h.commits)}). ` +
        "Small commits bisect; bulk ones bury their reason.",
    ),
    shape.largest.length === 0
      ? muted("No non-merge commit in this window.")
      : table(
          ["Files", "Commit", "Date", "Subject"],
          shape.largest.map((c) => [
            cell([n(c.files)]),
            cell([text([c.sha], { variant: "body-3" })]),
            cell([c.date], { className: "whitespace-nowrap" }),
            cell([text([excerpt(c.subject, SUBJECT_CHARS)], { variant: "body-3" })]),
          ]),
          { striped: true },
        ),
    muted(
      `Ranked by files touched. ${capNote(shape.largest.length, nonMerge, "non-merge commit")}`,
    ),
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
            `${countOf(total, "commit", "commits")} over all ` +
            `${countOf(h.months.length, "month", "months")}, against the ` +
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
    description:
      `${countOf(h.commits, "commit", "commits")} ${window}, ` +
      `${countOf(h.authors.length, "author", "authors")}.`,
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
                      "trajectory and the contributor flux is zero. Widen it with --since.",
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
                      countOf(h.commits - h.merges, "non-merge commit", "non-merge commits"),
                    ),
                    statTile(
                      "Files touched",
                      n(h.files.length),
                      countOf(h.touches, "file touch", "file touches"),
                    ),
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
                  value: "coupling",
                  label: "What changes together",
                  body: coupleTab(h, top),
                },
                {
                  value: "authors",
                  label: "Who built this",
                  body: whoTab(h, top),
                },
                {
                  value: "knowledge",
                  label: "Who knows what",
                  body: knowTab(h, top),
                },
                {
                  value: "work",
                  label: "How work lands",
                  body: workTab(h),
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
