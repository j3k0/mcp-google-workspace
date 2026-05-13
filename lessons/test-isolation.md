# Test isolation

`src/tools/gmail.ts` imports `googleapis`, which breaks on Node ≥ 23 (see
node-version.md). To keep `node:test` runnable on whichever Node the
contributor has, pure logic lives in `src/tools/gmail-helpers.ts` (zero
googleapis dependency). Tests import from `gmail-helpers.js`, never `gmail.js`.

When adding testable logic to `gmail.ts`, extract it to `gmail-helpers.ts`
first and have `gmail.ts` import + re-export it for backward compat.
