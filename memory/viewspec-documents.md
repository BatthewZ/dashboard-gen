# Emitting ViewSpec documents

This repo authors ViewSpec JSON for `@batthewz/response-ui-renderer` and never renders it.
That split is what makes the failures below possible: a document can pass every check the
build runs and still be wrong in the browser, because the build has no browser.

## The gates catch structure, not appearance

Two gates run on every document and both are fatal: `validateViewSpec` at the **warning**
tier as well as the error tier, and every `component` name against the live registry.
Neither substitutes for the other — the validator's React-free entry point has no registry,
so a misspelled component name validates clean and renders an inline warning box at
runtime. Passing on `ok` alone throws away most of the validator, because the warning tier
is where authoring mistakes actually live. It earns itself immediately: striping needs an
`index` on every table row, and without it a `striped` table silently renders flat.

Neither gate can see colour, contrast, overflow, or whether an element paints at all. Those
need a render, which is why the host is committed rather than rebuilt in a temp directory
each time — evidence that lives in `/tmp` stops being evidence the moment anything else
touches it, and a reader told "stand up a host, it takes twenty minutes" has been handed a
dead end rather than a step. Rendering has caught, in the work these documents come from:
an entire palette that never reached the page floor, sparklines painted in invisible black,
a table head that rendered as a headless grey band, markdown emphasis printing its own
asterisks because `Text` renders children literally, and prose comparing two numbers that
do not belong on the same scale. None of those were visible in the JSON, and every one of
them gated clean.

Point the CSS build at the library and never at the document. A utility class must come
from what the component library already compiles; if the build scans the document, a class
the document invented resolves under test and fails silently in the host it was written
for — and the experiment can no longer tell those two cases apart.

## Two token traps that look like theme bugs and are not

**A custom property paints nothing by itself.** `themeOverrides` sets variables on the
renderer's wrapper; a variable only becomes a colour where some element carries the utility
that reads it. Overriding the canvas token does nothing unless a node carries `bg-canvas` —
so a complete dark palette can render as dark cards stranded on the host's white page. Keep
the palette and the node that paints the floor in one module and hand out both together: a
second page adopting the theme is exactly where the pair gets separated and the defect ships
a second time.

**Marks that inherit `currentColor` inherit the browser default.** A component whose CSS
reads `var(--some-color, currentColor)` and whose parent is a plain layout wrapper gets
black, because the library sets text colour on typography components rather than on layout
ones. On a dark surface that is invisible rather than merely off-brand.

Two structural limits worth knowing before designing a theme: `themeOverrides` cannot flip
light ↔ dark, because `color-scheme` is a CSS property and no `--` key reaches it; and the
responsive scales (heading sizes, body text and their line heights, spacing steps, weights)
step up at a media query, so an inline override freezes them at one width. Committing to a
dark palette anyway is defensible only when you can name what still follows the host's
scheme — which, for a document with no native form controls, is scrollbar chrome.

Utilities are a second contract with the same shape: a class only works if it is already in
the host's compiled CSS, and it fails silently if not. The library's own utilities are safe
because any host that installs the library compiles them; an arbitrary arbitrary-value class
is not. Grep a compiled stylesheet rather than guessing.

## A chart component is not the same as a readable chart

The library's only chart is a sparkline, and it takes a bare `number[]`. It paints the
marks inside one SVG, which means a document cannot reach a single bar: no tick label, no
per-point hover, no value. That is legible as *shape* and unreadable as *data* — a reader
can see that some month was busy and cannot tell which month or how busy. Reach for a table
with a bar in one column instead, and keep the sparkline for the cases where only the
silhouette is being claimed. Pairing the two against one scale, as the trajectory block
does, gives the shape and the readable values without implying they are separate figures.
Both are worth checking against the actual question the block answers, because the failure
is not a rendering bug and no gate will report it.

A related limit worth knowing before designing any hover affordance: the renderer puts its
own wrapper between a parent and the element a document described, so a parent that clones
its child to inject a ref or handlers gets the wrapper instead. The renderer keeps a list
of the parents it drops that wrapper for — tooltips and the `asChild` triggers are on it —
and a hand-rolled equivalent silently never opens. Check that list before assuming a
composition works, and remember hover alone is not an affordance: a bubble that opens on
focus as well needs a trigger that can take focus, which a `span`-based chip cannot
without being told to.

Detail on hover is the natural home for the field that would falsify a label. It is not a
licence to hide the count's own population: enumerate from the same source the count came
from, or the bubble and the badge will disagree in front of the reader.

A status label that repeats down a column says nothing a reader can act on. Spend it only
on the tier that is worth hearing about, and have that tier say why it is that tier.

## The command that builds it and the command that opens it must compose

A ViewSpec is not readable as a file, so the build command's only useful ending is one that
leads to a render. Two defaults got this wrong at once and the pair failed in a user's
hands on the first try: the builder printed hundreds of KB to the terminal when no `-o` was
given — copied from an exporter, where piping into `jq` is the point — so the documented
next step had no file to open. Write by default, name the file the opener defaults to, and
print that next command after writing. Keep an explicit `--stdout` for the pipe.

Diagnostics must never share a stream with the payload. Interleaving the gate's report with
the document meant the pipe the flag existed for had never once worked, and nothing noticed
because nothing tested it. The fix that followed — *everything* to stderr, always — then
overshot: terminals paint stderr red, so a clean run reported both gates passing in the
colour of a crash, and the one line that was genuinely wrong looked no different from the
six that were fine. **Stream by kind, not by category:** progress and success on stdout,
failures on stderr, and the whole lot displaced to stderr only in the mode where the
document itself is the stdout payload. Let the argument parser that decides where output
goes set that, so a command cannot forget.

Keep a block of related lines on one stream — a summary and the issues under it — because
the two streams are buffered separately and a split block can reach the terminal out of
order, detaching "errors=2" from the two errors.

Which is the real lesson: **the entry point is the surface most likely to be untested and
most certain to be used.** Library functions here had thorough coverage while the CLI that
wraps them had none, and every defect a user actually hit lived in the wrapper — argument
parsing, where output lands, which stream carries what. Spawn the real command in a temp
directory and assert on the files it leaves behind, and on which stream said what: both
stream regressions here were invisible to every test that only checked exit codes. An
option that takes a value needs the same treatment — `-o` followed by another flag once
wrote a document to a file named after the flag and exited 0.

The stream rule generalises past this repo. A terminal renders stderr as failure whether or
not you meant it that way, so the stream is not a plumbing detail — it is the loudest signal
a command emits, and it is read before any of the words are. Choosing it by category
("diagnostics") rather than by kind ("this went wrong") spends that signal on nothing and
leaves the real failure indistinguishable from the routine.

## Derive every figure, and say what you left out

Nothing numeric in a document should be typed by hand. The first hand-written page this
work produced shipped four arithmetic errors, all of them plausible. Layout constants —
column counts, row caps, sparkline heights — are the only bare numbers that belong in a
spec builder.

Deriving a figure is not sufficient, though, because prose *around* a derived figure can
still assert something the data contradicts. Two shapes to watch:

- **A comparison across scales.** Two derived numbers put in one sentence imply they are
  comparable. A windowed count beside an all-history total reads as a subset relation that
  does not hold — which is exactly the seam here, where one block deliberately ignores the
  window every other block is bounded by. Put both totals in one sentence and name which
  is which, rather than on facing tiles where the reader supplies the relation.
- **A conditional stated unconditionally.** "which exceeds the window because they ran in
  parallel" is true on a busy day and false on a quiet one. If the claim depends on the
  figures, branch on the figures.

Anything a document silently drops — a top-N cut, a window filter, a parse failure — must
appear on the page with its size. A view showing ten of fourteen rows without saying so
reads as complete coverage, which is the same defect class as a metric that is always zero.
Write that disclosure as a helper and route every `.slice(0, N)` through it: the version of
a page that disclosed its one 3% cut in a prominent alert was silently cutting four other
tables by 20% to 85%, including one that hid 58% of the quantity it was ranking. Having the
principle is not the same as applying it, and the gap hides in the tables you did not think
of as truncated. Test that structurally — the note has to sit beside the table it describes,
which a document-wide string search cannot show.

Match the disclosure to the ordering. "The top 12" names the wrong twelve in a table sorted
by date; a chronological cut has to say it kept the most recent and how many older rows it
did not list.

**Filtering membership does not filter the numbers.** A window that admits any item
overlapping it, and then sums each admitted item whole, produces a page headed with the
window whose headline is largely work from outside it. Whether to clip is a real design
question, but the page must say which it did, next to the figure, not in a caption two tabs
away. And identify rows by a stamp that can distinguish the cases: a bare time-of-day on a
day-scale page reads as last night even when it was the night before.

## A counter that never fires looks like a finding

The strongest example this work produced: a friction metric read as zero on every subject
ever measured, because the reader recognised one spelling of an event and the source only
ever wrote another. Nothing failed. The number was simply always zero, and zero is a
perfectly readable answer to "how much friction was there".

The check that finds this is cheap and worth running against any counter you are about to
put on a page: tally the raw values in the source and confirm that something in the reader
consumes each one you claim to measure. A metric that is structurally incapable of being
non-zero should be removed or labelled, never displayed.

**Reviving a dead metric is where the second mistake lives.** Having made the counter
non-zero, the obvious label is almost always wrong, because the name in the code was
written from an assumption about what the event means rather than from the events. Read the
population before naming it. A constant zero is a visible absence; a confidently mislabelled
number is worse, because nothing about it looks wrong. Carry the field that would falsify
your label onto the page rather than dropping it in favour of a tidier one — which is why
every keyword tally here states its matching rule and its population beside the number.

## The document is machine-read, so indentation is most of its bytes

An emitted document is read by the renderer, never by a person — the preview host exists
because the file is not readable as a file. Indentation is therefore dead weight, roughly
six-sevenths of a large file, so serialise the written file compactly. Note that the stdout
mode is not the human-facing exception it looks like: that flag exists to feed a pipe, so if
you ever reach for "indent it for the reader" as the reason to treat the two destinations
differently, the reason is wrong even where the conclusion is harmless.

Beyond that, resist re-encoding schemes. The node keys repeat thousands of times and
shortening them looks like the obvious next win, but every rename, tuple-packing or
string-interning trick is competing with the compressor for the same redundancy. Measured:
stripping whitespace cut the file about six-fold; short keys and tuple-packed nodes cut a
further chunk of raw bytes but under a fifth of a kilobyte once gzipped, and a string
dictionary made the compressed size *worse*, because interning destroys the repetition the
compressor feeds on. Judge any such scheme in the unit that is actually stored or
transmitted, and expect the answer to be that it is not worth an encode/decode layer across
the builders, the gate and the renderer.

The version-control instinct misleads here too. These documents are gitignored because they
carry verbatim text from their source, not because of their size — and a tracked text file
of this shape costs single-digit kilobytes per revision anyway, since the object store
compresses and deltas it. Size is a reason to serialise carefully, not a reason to fear the
repository.

The lever that pays in both raw and compressed bytes is emitting fewer nodes: repeated
wrapper idioms — a cell that always contains one muted text node — are generator habits
rather than data, and folding them into a component default removes structure instead of
re-encoding it.
