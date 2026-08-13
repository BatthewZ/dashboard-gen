# Memory index — dashboard-gen

Turns a repository's own `git log` into a rendered page: churn, defect clusters,
authorship, trajectory, firefighting. The builder emits ViewSpec JSON and never renders it;
a small committed host does that.

| Document | Contents |
|---|---|
| [git-history-metrics.md](./git-history-metrics.md) | Reading `git log` as evidence: the commands that report nothing when a program rather than a person runs them, which date each figure stands on, why one figure must escape the window every other figure is bounded by, and how to name a keyword match so it is not read as a defect count. |
| [viewspec-documents.md](./viewspec-documents.md) | Authoring ViewSpec JSON for a renderer this repo never runs: what the build gates do and do not see, the token and utility traps that only appear in a browser, why the only chart component cannot label or be hovered, and the rules that keep derived figures from being wrapped in undeserved prose. |
| [verification.md](./verification.md) | How to establish that a change works: evidence that cannot fail, measuring in the unit the constraint is written in, structural rules that survive new inputs, and why fresh reviewers are required at a one-way door. |

## Orientation

Two commands are the whole product, and they are designed to compose with nothing to
remember: the builder writes the file the opener defaults to and ends by printing the
command that opens it. Treat that pair as a contract — a change that makes the builder
print instead of write, or that renames its default output, breaks the only workflow anyone
runs.

Reader-facing prose lives in the root README and nowhere else. Adding a second description
of a feature beside its code gives the two copies freedom to contradict each other.

The governing principle in the git document: the shell idiom this replaces
(`… | sort | uniq -c | sort -nr | head -20`) throws the population away before anything can
say what was cut, so every tally is counted in-process from full output and every table
states its own remainder.

The governing principle in the ViewSpec document, aimed at a metric rather than a test: a
counter the reader can never increment displays as a clean zero, and a zero is a perfectly
readable answer. Before putting any figure on a page, confirm the code path that produces
it has ever run.

The governing principle in the verification document: most false confidence here came from
evidence that could not have failed, not from code that was hard to reason about. Check
what your evidence would look like if the claim were false before trusting that it passed.

## Provenance

The document builder, the gate, the theme and the preview host were lifted from a larger
Claude Code session-forensics project, where they sat beside two transcript-driven pages
that this repo does not have. Anything that reads as over-built for one page — the shared
format helpers, the palette living in its own module beside the node that paints the page
floor — is carrying a scar from that context and is explained in the two documents above.
