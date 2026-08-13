# Verification

How to know a change actually works. Every rule here comes from a claim that was believed,
stated with evidence, and then shown false by someone who had not written it.

## Evidence that cannot fail is not evidence

**A test that passes against the implementation it was written to catch is not a test.**
Size the adversarial input so the good and bad implementations are far apart, then revert
the fix and watch it go red. A bound chosen without measuring both sides will sit on the
wrong side of the line.

**An assertion whose two sides are equal by construction proves nothing.** If the value
being checked is derived from the same list the code hard-codes, the check restates the
implementation. Assert against an independently-derived expectation, or against the
observable symptom a user would notice.

**Fixture-shaped blind spots are silent.** A fixture that lacks the feature an assertion
depends on makes that assertion vacuous rather than failing — it passes for the wrong
reason. Before trusting a check, confirm the fixture can actually express the failure. The
git fixtures here are built commit by commit for exactly this reason: canned command output
would test only itself, and a fixture that sets one of the two git dates gives a window
filter nothing to filter.

## Measure in the unit the constraint is written in

A byte limit needs a byte measurement. Codepoint counts undercount multibyte text by up to
four times, and the confusion propagates: it understates how big the problem is, it
over-trims when used as arithmetic on a character count, and it waves oversized payloads
past a guard. The same mistake will appear independently in the diagnosis, the fix, and the
tooling used to check the fix, because each is written by someone thinking in characters.

Beware measurement tools that are locale-dependent. A text utility's notion of length may
change with the environment, so the same command can report bytes on one machine and
characters on another.

**Averaging a spiky rate over calendar time understates it.** Dividing a total by elapsed
days silently divides by the days nothing happened. Report the rate over active periods and
the peak, because that is what capacity has to survive.

## Structural rules that survive new inputs

**Any branch claiming to bound something must be re-measured by a later unconditional
check.** The fallback that exists to guarantee a limit is exactly the branch nobody tests,
and it was itself the breach. Make the final check unconditional and independent of how
control arrived there.

**Filter at every depth or not at all.** A rule applied at one or two fixed levels is
aspiration; nesting defeats it, and the documentation will claim the aspiration.

## Fresh eyes are not optional at a one-way door

Self-review confirmed a build that independent reviewers then dismantled: of six staked
claims, three were refuted with working reproductions, and two of the defects had been
introduced by the fix itself. Reviewers who did not write the change attack the evidence as
well as the code, and the evidence is usually the weaker part.

Hand reviewers the request verbatim, never a summary. A paraphrase encodes the
interpretation under test, so reviewing against it cannot detect a misreading.

## Report the shape of the failure, not just its existence

Anything dropped, capped, or degraded has to be visible in the output. A field that records
a failure is only half the work: if no surface a human actually looks at renders it, the
degraded state remains indistinguishable from the healthy one. Trace the signal to
something a person sees before calling it surfaced.

When a correction changes a number that has already been quoted, correct it explicitly.
Figures propagate into documentation and comments quickly, and a stale figure repeated in
three places reads as corroboration.
