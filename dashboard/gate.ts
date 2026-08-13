/**
 * The two checks a document must pass before it is written, both fatal, neither
 * skippable — a gate that can silently not run is worse than no gate:
 *
 *   1. `validateViewSpec` — errors AND warnings. The warning tier is where authoring
 *      mistakes actually surface (enum typos, a Dialog with no literal id, forbidden
 *      props), so passing on `ok` alone throws away most of the tool.
 *   2. Component names against the live registry. `validateViewSpec` does NOT do this —
 *      its React-free entry point has no registry to check against, so a misspelled
 *      "Crad" validates clean and renders an inline warning box at runtime instead.
 */
import { chmodSync, writeFileSync } from "node:fs";
import { errorsOf, validateViewSpec, warningsOf } from "@batthewz/response-ui-renderer/spec";
import { defaultRegistry, listComponentNames } from "@batthewz/response-ui-renderer";
import type { ViewSpec } from "@batthewz/response-ui-renderer/spec";
import { fail, linesFor, payloadOnStdout, say } from "../src/report.ts";

/**
 * Where to write, or `undefined` for stdout — which now takes `--stdout` to ask for.
 *
 * This used to print the document whenever `-o` was absent. That is the wrong default:
 * nobody pipes a ViewSpec anywhere, and printing put hundreds of KB of JSON into the
 * terminal and left no file, so the documented next step — `bun run preview` — had nothing
 * to open and failed. Writing by default makes the two commands compose the way they read.
 *
 * `-o` still exits rather than accepting a value that is itself a flag: `-o --top 5` wrote
 * a document to a file literally named `--top` and exited 0.
 */
export function outPathArg(
  args: string[],
  usage: string,
  fallback: string,
): string | undefined {
  if (args.includes("--stdout")) {
    // The document is the payload now, so every diagnostic has to move off stdout. Done
    // here because the CLI must call this to learn where to write.
    payloadOnStdout();
    return undefined;
  }
  const i = args.indexOf("-o");
  if (i < 0) return fallback;
  const value = args[i + 1];
  if (value === undefined || value.startsWith("-")) {
    fail(`-o requires a path, and "${value ?? ""}" is not one\n${usage}`);
    process.exit(2);
  }
  return value;
}

/** Every `component` string anywhere in the document, including compound parts. */
export function componentNames(node: unknown, into = new Set<string>()): Set<string> {
  if (Array.isArray(node)) {
    for (const child of node) componentNames(child, into);
  } else if (node && typeof node === "object") {
    const rec = node as Record<string, unknown>;
    if (typeof rec.component === "string") into.add(rec.component);
    for (const value of Object.values(rec)) componentNames(value, into);
  }
  return into;
}

/**
 * Logs both checks and returns whether the document is publishable.
 *
 * A clean check reports on stdout and a failing one on stderr — see `src/report.ts`. What
 * must never happen is a diagnostic on the stream carrying the document: `--stdout` once
 * emitted something no parser could read, and the pipe the flag exists for never worked.
 */
export function gate(spec: ViewSpec): boolean {
  let ok = true;

  const result = validateViewSpec(spec);
  const errors = errorsOf(result.issues);
  const warnings = warningsOf(result.issues);
  // Warnings are fatal here, so they report as failures rather than as an aside.
  const validation = linesFor(result.ok && errors.length === 0 && warnings.length === 0);
  validation(
    `validateViewSpec  ok=${result.ok}  errors=${errors.length}  warnings=${warnings.length}`,
  );
  for (const i of errors) validation(`  ERROR  ${i.path}: ${i.message}`);
  for (const i of warnings) validation(`  WARN   ${i.path}: ${i.message}`);
  if (!result.ok || errors.length > 0 || warnings.length > 0) ok = false;

  const known = new Set(listComponentNames(defaultRegistry));
  const used = [...componentNames(spec)].sort();
  const unknown = used.filter((c) => !known.has(c));
  const registry = linesFor(unknown.length === 0);
  registry(
    `registry          ${used.length} names used, ${known.size} known, ${unknown.length} unresolved`,
  );
  for (const c of unknown) registry(`  UNKNOWN  ${c}`);
  if (unknown.length > 0) ok = false;

  return ok;
}

/**
 * Gate, then write — or exit 1 without writing. Every CLI here ends this way, so the exit
 * code and the file mode are decided in one place.
 */
export function gateAndEmit(spec: ViewSpec, outPath?: string): void {
  if (!gate(spec)) {
    fail("\ndashboard gate FAILED — not writing output");
    process.exit(1);
  }
  if (!outPath) {
    console.log(JSON.stringify(spec, null, 2));
    return;
  }
  // Nothing reads the file but the renderer, and on a large repo indenting it costs six
  // bytes for every one of content. The stdout payload keeps its existing shape.
  const json = JSON.stringify(spec) + "\n";
  // 0600: the document carries verbatim commit messages. `writeFileSync`'s
  // mode applies only when the file is CREATED, so a re-run over an existing 0644 file
  // would keep it world-readable while this line claimed otherwise. chmod unconditionally.
  writeFileSync(outPath, json, { mode: 0o600 });
  chmodSync(outPath, 0o600);
  say(
    `\n${(Buffer.byteLength(json) / 1024).toFixed(1)} KB → ${outPath}\n` +
      // A ViewSpec is not readable as a file. Ending on the command that renders it is the
      // difference between "it wrote something" and "I can see it".
      `look at it:  bun run preview ${outPath}`,
  );
}
