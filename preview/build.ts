/**
 * Render a ViewSpec document in a browser.
 *
 *   bun run preview <doc.blob.json> [--port N]
 *
 * The repo emits documents and does not run React; this is the smallest host that proves
 * one actually paints, and it exists because the build gates cannot see appearance. They
 * check structure — enum values, component names, nesting — and every visual defect this
 * project has shipped (a palette that never reached the page floor, sparklines drawn in
 * invisible black, a table head rendering as a headerless band) passed both gates cleanly.
 *
 * It compiles Tailwind from the three CSS layers alone and never points `@source` at the
 * document, so a utility class only resolves if the component library already ships it —
 * the same condition a real host has, and the reason an arbitrary class fails silently.
 */
import { chmodSync, copyFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { fail, say } from "../src/report.ts";

const HERE = import.meta.dir;
const args = process.argv.slice(2);
const USAGE = "usage: bun run preview [doc.blob.json] [--port N]";
/** What `bun run history` writes when told nothing, so `bun run preview` needs no argument. */
const DEFAULT_DOC = "history.blob.json";

const portFlag = args.indexOf("--port");
const port = portFlag >= 0 ? Number(args[portFlag + 1]) : 8787;
if (portFlag >= 0 && !Number.isInteger(port)) {
  fail(`--port needs an integer\n${USAGE}`);
  process.exit(2);
}
const consumed = new Set<number>();
if (portFlag >= 0) consumed.add(portFlag).add(portFlag + 1);
const doc = args.find((a, i) => !consumed.has(i) && !a.startsWith("-")) ?? DEFAULT_DOC;

if (!existsSync(doc) || !statSync(doc).isFile()) {
  // The likeliest cause is that the document was never built, so say the command that
  // builds it rather than only the one that failed.
  fail(
    `no such file: ${doc}\n` +
      `build one first:  bun run history        (writes ${DEFAULT_DOC})\n${USAGE}`,
  );
  process.exit(2);
}

async function run(cmd: string[], label: string): Promise<void> {
  const p = Bun.spawnSync(cmd, { cwd: HERE, stdout: "pipe", stderr: "pipe" });
  if (p.exitCode !== 0) {
    fail(`${label} failed:\n${p.stderr.toString()}`);
    process.exit(1);
  }
}

await run(
  ["bunx", "@tailwindcss/cli", "-i", "app.css", "-o", "app.build.css"],
  "tailwind build",
);
await run(
  ["bun", "build", "main.tsx", "--outfile", "main.js", "--target", "browser",
   "--define", 'process.env.NODE_ENV="production"'],
  "bundle",
);
// Copied rather than served from its own path: the page fetches a same-origin `spec.json`,
// and the document is 0600 for a reason — this keeps it inside the directory the server
// already exposes rather than opening a second one.
const served = join(HERE, "spec.json");
copyFileSync(doc, served);
// `copyFileSync` takes the source's mode only when it creates the file, so a second run
// over an existing 0644 copy would leave a private repo's commit messages world-readable.
// Same trap, and same fix, as the writer in `dashboard/gate.ts`.
chmodSync(served, 0o600);

Bun.serve({
  port,
  fetch(req) {
    const path = new URL(req.url).pathname;
    const file = path === "/" ? "index.html" : path.slice(1);
    // Only the four build products and the document. A path from the request never
    // becomes a filesystem path, so there is nothing for a traversal to reach.
    const allowed = ["index.html", "app.build.css", "main.js", "spec.json"];
    if (!allowed.includes(file)) return new Response("not found", { status: 404 });
    return new Response(Bun.file(join(HERE, file)));
  },
});

say(
  `${doc} → http://localhost:${port}\n` +
    "This page carries verbatim commit messages and is served to localhost only. Ctrl-C to stop.",
);
