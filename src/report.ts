/**
 * Which stream a CLI's diagnostics go to.
 *
 * Everything here used to go to stderr, on the rule that diagnostics never share a stream
 * with output. That is right only when the output *is* stdout: terminals paint stderr red,
 * so a successful run reported "3 sessions → out.json" in the colour of a crash, and the
 * one thing on the page that was actually wrong looked no different from the six that were
 * fine. Progress and success go to stdout; genuine failures stay on stderr, where the red
 * means what it says.
 *
 * The exception is the mode where the document itself is written to stdout — `--stdout`,
 * or `export` with no `-o`. There a progress line would corrupt the payload, so `say`
 * switches to stderr for the whole run. `payloadOnStdout()` is called by the argument
 * parser that decides that, so a command cannot forget it.
 */
let progress: (message: string) => void = console.log;

/** Call before printing anything, when the payload is going to stdout. */
export function payloadOnStdout(): void {
  progress = console.error;
}

/** Progress and success. Not an error, and must not be coloured as one. */
export function say(message: string): void {
  progress(message);
}

/** A failure: a bad argument, an unreadable file, a gate that refused to write. */
export function fail(message: string): void {
  console.error(message);
}

/**
 * The printer for a block of related lines — a summary and the issues under it.
 *
 * A block reports on one stream, chosen by whether it contains a failure. stdout and stderr
 * are buffered separately, so a summary on one and its detail lines on the other can reach
 * the terminal out of order, and "errors=2" would arrive detached from the two errors.
 */
export function linesFor(ok: boolean): (message: string) => void {
  return ok ? say : fail;
}
