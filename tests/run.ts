/**
 * Regression guard. No framework, no dependencies — `bun run test`.
 *
 * Every case here is a bug that actually shipped or was introduced mid-fix, not a
 * hypothetical. The git fixtures are real repositories built commit by commit: the parsing
 * is the thing under test, and a fixture of canned `git log` output would test nothing but
 * itself.
 */
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { errorsOf, validateViewSpec, warningsOf } from "@batthewz/response-ui-renderer/spec";
import type { ComponentNode } from "@batthewz/response-ui-renderer/spec";
import { listComponentNames } from "@batthewz/response-ui-renderer";
import { buildHistorySpec, collect, fillMonths, monthsBetween, trendLine } from "../dashboard/history.ts";
import { componentNames } from "../dashboard/gate.ts";
import { contracts, registry } from "../src/registry.ts";
import { capNote, excerpt, share, tailNote } from "../dashboard/format.ts";

// The SHARED registry and contracts, not the library defaults: the gate and the host must
// agree on them, and `Heatmap` exists only in the shared ones. Validating with them here
// exercises the same options the gate passes.
const knownComponents = new Set(listComponentNames(registry));
const validate = (spec: unknown) => validateViewSpec(spec, { registry, contracts });
/** The cap `history.ts` puts on a commit subject; excerpt is exercised at that boundary. */
const SUBJECT_CAP = 96;

let failed = 0;
function check(name: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`  ok    ${name}`);
  } else {
    console.log(`  FAIL  ${name}\n          expected ${e}\n          actual   ${a}`);
    failed++;
  }
}

/** Every node in a document instantiating `name`, at any depth. */
function nodesNamed(node: unknown, name: string, into: ComponentNode[] = []): ComponentNode[] {
  if (Array.isArray(node)) {
    for (const child of node) nodesNamed(child, name, into);
  } else if (node && typeof node === "object") {
    const rec = node as Record<string, unknown>;
    if (rec.component === name) into.push(rec as ComponentNode);
    for (const value of Object.values(rec)) nodesNamed(value, name, into);
  }
  return into;
}

console.log("formatting: the helpers every figure on the page passes through");
{
  // An astral character straddling the cut emits a lone surrogate — invalid UTF-16 in the
  // middle of the author's own words.
  const astral = "x".repeat(SUBJECT_CAP - 1) + "\u{1F600}" + " and more subject after it";
  const cut = excerpt(astral, SUBJECT_CAP);
  check("an excerpt never ends mid-surrogate-pair",
    /[\uD800-\uDBFF]$/.test(cut.replace(/…$/, "")), false);
  check("…and is still capped", cut.length <= SUBJECT_CAP + 1, true);

  // A top-N table reads as exhaustive unless it says otherwise.
  check("a capped list says what it left out", capNote(10, 15, "file", "40% of all touches"),
    "Showing the top 10 of 15 files; the 5 not listed hold 40% of all touches.");
  check("…and an uncapped one says so rather than implying a cut",
    capNote(15, 15, "file"), "All 15 files.");
  check("…with the singular right at the boundary", capNote(1, 1, "file"), "All 1 file.");

  // The chronological cut has the same singular boundary — a 13-month repo cuts exactly
  // one row, and "the 1 older are not listed" shipped once.
  check("a chronological cut agrees with its own count",
    tailNote(12, 13, "month"), "The most recent 12 of 13 months; the 1 older month is not listed.");
  check("…and in the plural", tailNote(12, 17, "month"),
    "The most recent 12 of 17 months; the 5 older months are not listed.");
  check("…and an uncut list claims no cut", tailNote(3, 3, "year"), "All 3 years.");

  // "the 4 authors not listed hold 0% of the commits" says they hold none.
  check("a tiny share never reads as none", share(4, 24_899), "<0.1%");
  check("…while none still reads as none", share(0, 24_899), "0%");
  check("…and nothing to divide by is not a percentage of anything", share(3, 0), "0%");
  check("…an ordinary share keeps its one decimal", share(1755, 24_899), "7%");
}

/** A real repository built commit by commit — the parsing is the thing under test. */
function gitRepo(prefix: string) {
  const repo = mkdtempSync(join(tmpdir(), prefix));
  const run = (args: string[], when?: string) =>
    Bun.spawnSync(["git", ...args], {
      cwd: repo,
      env: {
        ...process.env,
        GIT_AUTHOR_DATE: when ?? "2024-01-15T09:00:00+0000",
        // `--since` filters on committer date, so a fixture that sets only the author date
        // has no window to test: every commit lands at whenever the suite ran.
        GIT_COMMITTER_DATE: when ?? "2024-01-15T09:00:00+0000",
        GIT_CONFIG_GLOBAL: "/dev/null",
        GIT_CONFIG_SYSTEM: "/dev/null",
      },
    });
  const commit = (msg: string, files: string[], when: string, who: string) => {
    for (const f of files) writeFileSync(join(repo, f), `${msg}\n`);
    run(["add", ...files]);
    run(["-c", `user.name=${who}`, "-c", `user.email=${who}@x.test`, "commit", "-m", msg], when);
  };
  return { repo, run, commit };
}

console.log("repo history: counted from a repo whose every commit is known");
// The shell one-liners this replaces are `sort | uniq -c | head -20`, so the only way to
// know the tallies are right is to build a history by hand and count it by hand.
{
  const { repo, run, commit } = gitRepo("hist-");

  run(["init", "-b", "main"]);
  commit("add a.ts and b.ts", ["a.ts", "b.ts"], "2024-01-15T09:00:00+0000", "Alice");
  commit("fix broken parser in a.ts", ["a.ts"], "2024-01-20T09:00:00+0000", "Alice");
  run(["checkout", "-b", "side"]);
  commit("side work", ["d.ts"], "2024-03-07T09:00:00+0000", "Alice");
  run(["checkout", "main"]);
  commit('Revert "add a.ts and b.ts"', ["b.ts"], "2024-03-05T09:00:00+0000", "Bob");
  commit("hotfix: emergency rollback of c", ["c.ts"], "2024-03-06T09:00:00+0000", "Bob");
  run(["-c", "user.name=Bob", "-c", "user.email=bob@x.test", "merge", "--no-ff", "-m",
    "Merge branch 'side'", "side"], "2024-03-08T09:00:00+0000");

  const h = collect(repo, "2000-01-01");
  check("total commits include the merge", h.commits, 6);
  check("…and the merge is counted as one", h.merges, 1);
  // `git shortlog -sn --no-merges` — which reads stdin instead of the repo when stdin is
  // not a terminal, and reports nothing at all.
  check("authors rank by non-merge commits, with their all-history active span", h.authors, [
    // Their files are the ownership map read the other way, ranked, ties by path.
    { name: "Alice", commits: 3, firstMonth: "2024-01", lastMonth: "2024-03",
      files: [{ path: "a.ts", commits: 2 }, { path: "b.ts", commits: 1 }, { path: "d.ts", commits: 1 }] },
    // Bob's merge is excluded from his count but still moves his last-active month.
    { name: "Bob", commits: 2, firstMonth: "2024-03", lastMonth: "2024-03",
      files: [{ path: "b.ts", commits: 1 }, { path: "c.ts", commits: 1 }] },
  ]);
  check("…and they sum to the non-merge total",
    h.authors.reduce((a, x) => a + x.commits, 0), h.commits - h.merges);
  // A merge introduces no file of its own, so d.ts is touched once, by `side work`.
  // Equal counts sort by path, so the table does not reshuffle when a commit lands.
  // Owners are counted per file from the same records as churn. b.ts is an ownership
  // tie (Alice and Bob once each), which breaks by name so the table cannot reshuffle.
  check("churn counts commits per file with its main author, merge excluded", h.files,
    [{ path: "a.ts", commits: 2, fixes: 1, owner: "Alice", ownerCommits: 2 },
     { path: "b.ts", commits: 2, fixes: 0, owner: "Alice", ownerCommits: 1 },
     { path: "c.ts", commits: 1, fixes: 1, owner: "Bob", ownerCommits: 1 },
     { path: "d.ts", commits: 1, fixes: 0, owner: "Alice", ownerCommits: 1 }]);
  check("…and file touches sum over every row", h.touches, 6);
  // "hotfix" contains "fix": the grep is a word-fragment match and the page says so.
  check("fix-flagged commits match fix|bug|broken anywhere", h.fixCommits, 2);
  check("firefighting reads subjects only, newest first", h.fires.map((f) => f.subject),
    ["hotfix: emergency rollback of c", 'Revert "add a.ts and b.ts"']);
  check("…with the author and date attached",
    [h.fires[0]?.date, h.fires[0]?.author], ["2024-03-06", "Bob"]);
  check("a silent month is a row, not a gap",
    h.months.slice(0, 3), [{ month: "2024-01", commits: 2 }, { month: "2024-02", commits: 0 },
      { month: "2024-03", commits: 4 }]);
  check("…and the series runs to today, so a dead repo shows its silence",
    h.months[h.months.length - 1]?.month, h.nowMonth);

  // Coupling: the only commit touching 2–10 files is "add a.ts and b.ts", so exactly one
  // pair exists and every single-file commit is disclosed as pairless, not dropped.
  check("co-change pairs come from multi-file commits only", h.pairs,
    [{ a: "a.ts", b: "b.ts", together: 1, aCommits: 1, bCommits: 1 }]);
  check("…and the coupling population accounts for every non-merge commit",
    h.coupling, { eligible: 1, single: 4, oversize: 0 });

  // Shape: non-merge file counts are [2,1,1,1,1] — median 1, nothing mega, and the
  // 2-file commit ranks first with its subject joined back on.
  check("a median commit is counted from non-merge file counts",
    [h.shape.median, h.shape.mega], [1, 0]);
  check("…and the largest commit keeps its subject, date and size",
    [h.shape.largest[0]?.files, h.shape.largest[0]?.subject, h.shape.largest[0]?.date],
    [2, "add a.ts and b.ts", "2024-01-15"]);

  // Rhythm: every fixture commit is stamped 09:00 UTC, and +0000 makes author-local
  // equal UTC. 2024-01-15 Mon, 01-20 Sat, 03-05 Tue, 03-06 Wed, 03-07 Thu, 03-08 Fri.
  check("work rhythm buckets by author-local weekday and hour",
    h.rhythm.map((row) => row[9]), [1, 1, 1, 1, 1, 1, 0]);
  check("…and every commit in the window lands in exactly one cell",
    h.rhythm.flat().reduce((a, b) => a + b, 0), h.commits);

  // Flux: Alice and Bob both first commit in 2024, and the years run to today so the
  // silence since is visible, exactly like the month series.
  check("contributor flux counts active and first-time authors per year",
    h.flux[0], { year: "2024", active: 2, fresh: 2 });
  check("…runs to the current year", h.flux[h.flux.length - 1]?.year, h.nowMonth.slice(0, 4));
  check("…and every author is first-time exactly once",
    h.flux.reduce((a, y) => a + y.fresh, 0), h.authors.length);

  check("months between two YYYY-MM stamps count whole months",
    [monthsBetween("2024-01", "2024-07"), monthsBetween("2023-11", "2024-01")], [6, 2]);

  // Windowing: `--since` must move every count, not only the header.
  const late = collect(repo, "2024-02-01");
  check("a window drops the commits outside it", late.commits, 4);
  check("…and the files only those commits touched",
    late.files.map((f) => f.path).sort(), ["b.ts", "c.ts", "d.ts"]);
  check("…and its authors, whose spans stay all-history", late.authors, [
    { name: "Bob", commits: 2, firstMonth: "2024-03", lastMonth: "2024-03",
      files: [{ path: "b.ts", commits: 1 }, { path: "c.ts", commits: 1 }] },
    // The window drops Alice's January commits, so only her side-branch file remains.
    { name: "Alice", commits: 1, firstMonth: "2024-01", lastMonth: "2024-03",
      files: [{ path: "d.ts", commits: 1 }] },
  ]);
  check("…while the trajectory stays all-history, as the page says it does",
    late.months[0]?.month, "2024-01");

  const spec = buildHistorySpec(h, 20);
  const issues = validate(spec).issues;
  check("the document validates, warnings included",
    [errorsOf(issues).length, warningsOf(issues).length], [0, 0]);
  check("…and every component name is one the renderer knows",
    [...componentNames(spec)].filter((c) => !knownComponents.has(c)), []);
  // Every table here is a slice of something larger, and a ranked table with no note reads
  // as the whole population. Structural rather than a text count: the disclosure has to sit
  // beside the table it describes, which is the part a passing string search cannot show.
  // An array holding N tables needs N disclosures, not one — three tables sharing a tab
  // body could otherwise lose two of their notes without this noticing.
  const undisclosed = (node: unknown, out: string[] = []): string[] => {
    if (Array.isArray(node)) {
      const tables = node.filter(
        (c) => typeof c === "object" && c !== null && (c as ComponentNode).component === "Table");
      if (tables.length > 0) {
        const prose = node
          .filter((c) => !tables.includes(c))
          .map((c) => JSON.stringify(c))
          .join(" ");
        const notes = prose.match(/All \d|Showing the top|The most recent/g) ?? [];
        if (notes.length < tables.length) {
          out.push(JSON.stringify(tables[0]).slice(0, 60));
        }
      }
      for (const c of node) undisclosed(c, out);
    } else if (node && typeof node === "object") {
      for (const v of Object.values(node)) undisclosed(v, out);
    }
    return out;
  };
  check("…and every table sits beside a note saying what it left out", undisclosed(spec), []);
  // Nine fixed tables, plus one per author sub-tab in the knowledge tracker.
  check("…on all of them, including one per author", nodesNamed(spec, "Table").length, 11);
  check("…whose author sub-tabs nest inside the page tabs",
    nodesNamed(spec, "Tabs").length, 2);
  // Bob's b.ts row reads 50% of his commits AND 50% of the file — two adjacent cells no
  // other table produces. (A first draft matched a lone "50%", which the knowledge-risk
  // table also emits: a check that could not fail.)
  check("…and the tracker states an author's share of a shared file, both ways",
    JSON.stringify(spec).includes(
      '"children":["50%"]},{"component":"Table.Cell","children":["50%"]}'), true);
  // Two files make one pair; a 2×2 matrix restates the table, so only the rhythm grid
  // renders a Heatmap here.
  check("…and a two-file repo gets the rhythm heatmap but no matrix",
    nodesNamed(spec, "Heatmap").length, 1);
  // The fixture's authors last committed in 2024, which is stale by the time any suite
  // runs — so the ghost path is a counter that actually fires: a.ts is Alice's alone.
  check("…and a solely-owned file with a long-gone author is flagged, date attached",
    JSON.stringify(spec).includes("at risk · last commit 2024-03"), true);

  // An empty window is the shape most likely to divide by zero: no max to scale a bar to,
  // no denominator for a share.
  const empty = collect(repo, "2099-01-01");
  const emptySpec = buildHistorySpec(empty, 20);
  const emptyIssues = validate(emptySpec).issues;
  check("an empty window still produces a valid document",
    [errorsOf(emptyIssues).length, warningsOf(emptyIssues).length], [0, 0]);
  check("…and says so rather than showing four zeroes",
    JSON.stringify(emptySpec).includes("No commit falls since 2099-01-01"), true);
  check("…with no NaN anywhere in it", JSON.stringify(emptySpec).includes("null"), false);

  // The in-progress month always looks like a collapse: on the 3rd of the month a healthy
  // repo would report itself dying.
  const flat = (counts: number[]) =>
    counts.map((c, i) => ({ month: `2024-0${i + 1}`, commits: c }));
  check("a trend excludes the month in progress",
    trendLine(flat([4, 4, 4, 8, 8, 8, 0]), "2024-07"),
    "8.0 commits/month over the last 3 complete months, against 4.0 over the 3 before that — +100%, accelerating.");
  check("…calls a fall a fall",
    trendLine(flat([8, 8, 8, 4, 4, 4, 0]), "2024-07")?.endsWith("-50%, slowing."), true);
  check("…and holds its tongue when the history is too short",
    trendLine(flat([1, 1, 1, 1, 1]), "2024-07"), undefined);

  check("months fill through the month asked for, not the last commit",
    fillMonths(new Map([["2024-01", 2], ["2024-03", 4]]), "2024-05").map((m) => m.commits),
    [2, 0, 4, 0, 0]);

  rmSync(repo, { recursive: true, force: true });
}

console.log("coupling: bulk edits are excluded and say so, confidence is per rarer file");
{
  const { repo, run, commit } = gitRepo("couple-");
  run(["init", "-b", "main"]);
  const when = "2024-05-06T10:00:00+0000";
  const bulk = (count: number, prefix: string) =>
    Array.from({ length: count }, (_, i) => `${prefix}${String(i).padStart(2, "0")}.ts`);
  commit("triple", ["x.ts", "y.ts", "z.ts"], when, "Carol");
  commit("pair again", ["x.ts", "y.ts"], "2024-05-07T10:00:00+0000", "Carol");
  commit("big bulk", bulk(11, "h"), "2024-05-08T10:00:00+0000", "Carol");
  commit("solo", ["x.ts"], "2024-05-09T10:00:00+0000", "Carol");
  commit("mega bulk", bulk(31, "g"), "2024-05-10T10:00:00+0000", "Carol");

  const h = collect(repo, "2000-01-01");
  // The 11- and 31-file commits pair everything with everything, so they are set aside
  // from coupling — but their files still churn: exclusion is per analysis, not global.
  check("commits touching more than 10 files leave no pair", h.pairs, [
    { a: "x.ts", b: "y.ts", together: 2, aCommits: 2, bCommits: 2 },
    { a: "x.ts", b: "z.ts", together: 1, aCommits: 2, bCommits: 1 },
    { a: "y.ts", b: "z.ts", together: 1, aCommits: 2, bCommits: 1 },
  ]);
  check("…and are disclosed as oversize, beside the single-file count",
    h.coupling, { eligible: 2, single: 1, oversize: 2 });
  check("…while their files still count as churn", h.files.length, 45);
  check("…the 31-file commit is mega, the 11-file one is not",
    [h.shape.mega, h.shape.largest[0]?.files, h.shape.largest[0]?.subject],
    [1, 31, "mega bulk"]);
  check("…and the median stands on all five non-merge commits", h.shape.median, 3);

  // Three files share pairs here, so the co-change matrix renders beside the rhythm grid.
  const spec = buildHistorySpec(h, 20);
  const issues = validate(spec).issues;
  check("a document with both heatmaps validates, warnings included",
    [errorsOf(issues).length, warningsOf(issues).length], [0, 0]);
  check("…every component name is one the shared registry knows",
    [...componentNames(spec)].filter((c) => !knownComponents.has(c)), []);
  check("…and the matrix joins the rhythm grid", nodesNamed(spec, "Heatmap").length, 2);
  const matrix = nodesNamed(spec, "Heatmap").find(
    (node) => (node.props as { verticalColLabels?: boolean }).verticalColLabels === true,
  );
  const values = (matrix?.props as { values: Array<Array<number | null>> }).values;
  check("…whose diagonal is missing cells, not zeroes",
    values.every((row, i) => row[i] === null), true);
  check("…and whose cells mirror the pair counts",
    [values[0]?.[1], values[1]?.[0], values[0]?.[2]], [2, 2, 1]);

  rmSync(repo, { recursive: true, force: true });
}

console.log("history CLI: the entry point users actually run");
{
  const repo = mkdtempSync(join(tmpdir(), "histcli-"));
  const env = {
    ...process.env,
    GIT_AUTHOR_DATE: "2024-01-15T09:00:00+0000",
    GIT_COMMITTER_DATE: "2024-01-15T09:00:00+0000",
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_SYSTEM: "/dev/null",
  };
  Bun.spawnSync(["git", "init", "-b", "main"], { cwd: repo, env });
  writeFileSync(join(repo, "a.ts"), "x\n");
  Bun.spawnSync(["git", "add", "a.ts"], { cwd: repo, env });
  Bun.spawnSync(["git", "-c", "user.name=Alice", "-c", "user.email=a@x.test", "commit", "-m", "first"],
    { cwd: repo, env });

  const cli = join(import.meta.dir, "..", "dashboard", "history.ts");
  const out = mkdtempSync(join(tmpdir(), "histout-"));
  const run = (args: string[]) =>
    Bun.spawnSync(["bun", "run", cli, "--repo", repo, ...args], { cwd: out, env: process.env });

  const bare = run(["--since", "2000-01-01"]);
  check("no flags exits 0", bare.exitCode, 0);
  check("…and writes the file the next command opens", readdirSync(out), ["history.blob.json"]);
  check("…0600, because the subjects are verbatim commit messages",
    (statSync(join(out, "history.blob.json")).mode & 0o777).toString(8), "600");
  check("…and it says how to look at it",
    bare.stdout.toString().includes("bun run preview history.blob.json"), true);
  check("…on stdout, so a successful run is not painted as an error",
    bare.stderr.toString(), "");

  // A one-commit repo is the first thing anyone renders after `git init`, and it is the
  // only shape where every count on the page is singular. Two tiles and the trajectory
  // footnote read "1 commits" until every count goes through `countOf`.
  const fresh = readFileSync(join(out, "history.blob.json"), "utf8");
  check("a repo with one commit is not described in the plural",
    fresh.match(
      /\b1 (?:[a-z\/-]+ )*(?:commits|months|years|files|pairs|authors|merges|touches|fixes)\b/g,
    ),
    null);

  rmSync(join(out, "history.blob.json"));
  const piped = run(["--since", "2000-01-01", "--stdout"]);
  check("--stdout puts a parseable document on stdout",
    (JSON.parse(piped.stdout.toString()) as { version: number }).version, 1);
  check("…and writes no file", readdirSync(out), []);
  check("…with the report displaced to stderr, or the pipe carries both",
    piped.stderr.toString().includes("validateViewSpec"), true);

  const named = run(["--since", "2000-01-01", "-o", "x.json"]);
  check("-o decides the path", [named.exitCode, readdirSync(out)], [0, ["x.json"]]);
  rmSync(join(out, "x.json"));

  const notARepo = Bun.spawnSync(["bun", "run", cli, "--repo", out], { cwd: out });
  check("a directory that is not a repo exits 2 rather than emitting an empty page",
    notARepo.exitCode, 2);
  check("…and a real failure still goes to stderr, where red means something",
    [notARepo.stdout.toString(), notARepo.stderr.toString().includes("not a git repository")],
    ["", true]);
  check("…and --top refuses a value it cannot rank by",
    run(["--top", "0"]).exitCode, 2);
  // `-o --since 2020` once wrote a document to a file literally named `--since` and exited 0.
  check("…and -o refuses a value that is itself a flag",
    run(["-o", "--since"]).exitCode, 2);

  rmSync(repo, { recursive: true, force: true });
  rmSync(out, { recursive: true, force: true });
}

console.log("preview: the host that proves a document paints");
{
  const out = mkdtempSync(join(tmpdir(), "prev-"));
  const cli = join(import.meta.dir, "..", "preview", "build.ts");
  const missing = Bun.spawnSync(["bun", "run", cli], { cwd: out, env: process.env });
  check("a document that was never built exits 2 rather than serving nothing",
    missing.exitCode, 2);
  // The likeliest cause is that `history` was never run, so the error has to name it.
  check("…and names the command that builds one",
    missing.stderr.toString().includes("bun run history"), true);
  check("…without a bad --port slipping through as NaN",
    Bun.spawnSync(["bun", "run", cli, "--port", "x"], { cwd: out, env: process.env }).exitCode, 2);
  rmSync(out, { recursive: true, force: true });
}

console.log(failed ? `\n${failed} check(s) FAILED` : "\nall checks passed");
process.exit(failed ? 1 : 0);
