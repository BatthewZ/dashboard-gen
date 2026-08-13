# Rules for developing:

1. Before making changes search the codebase (don't assume not implemented).

2. Before implementing your own components or styling conventions, look into what is
   currently available from the @batthewz libraries in node_modules (ie
   @batthewz/response-ui-css, @batthewz/response-ui-react-components,
   @batthewz/response-ui-renderer). Read up to see how they work and what's available to
   understand how to implement.

3. Clean, modular, maintainable design preferred, but not at the expense of accuracy.

4. Important: We want single sources of truth, no migrations/adapters. If tests unrelated to
   your work fail then it's your job to resolve these tests as part of the increment of
   change.

5. Never suppress or add ts/eslint error ignores. The feedback is important. Never suppress,
   only fix.

6. Run tests for whatever unit of code was changed. Fix if required.

7. Always run `bun run typecheck` after code changes and fix if required.

8. Comments and docblocks in code files: Don't write them unless the code is not self
   explanatory. If you must write them, be as terse as possible without sacrificing
   necessary nuance or accuracy.

9. Always save relevant info for future agents working in this repo to ./memory, updating
   ./memory/README.md which is the index for that folder. This should not include any
   upcoming tasks, or TODOs, and should not reference line numbers or specific files - just
   principles and guidance.

10. If you need to use a browser, run `playwright-cli -h`

11. Before writing tests, read [guides/tests.md](./guides/tests.md).

12. The build gates cannot see appearance. Any change to what the page looks like has to be
    verified by rendering it — `bun run history && bun run preview` — not by reading the
    JSON. Read [memory/viewspec-documents.md](./memory/viewspec-documents.md) first.

## Comments

Comments: none, unless deletion would lose a fact unrecoverable from the code — a platform
behaviour, a cross-service contract, or an experiment already run. State the behaviour, not
the citation — references rot. Then: one sentence, ≤2 lines, at the code it explains, stated
once. Empty catch blocks always take one. Only a comment tagged
`Rejected: [X] because [Y]` may run longer.

Delete obsolete or narrative comments in the blocks you edit. No banners, and no JSDoc that
restates a type — document contracts, not signatures. When shortening, keep every claim and
add none; a compressed comment must still be true.
