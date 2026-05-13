# Node version

`googleapis` transitively pulls `buffer-equal-constant-time`, which uses
`require('buffer').SlowBuffer` — removed in Node ≥ 23. The server crashes
at import time on Node 25 with `TypeError: Cannot read properties of
undefined (reading 'prototype')`.

Workaround: invoke with Node 22 (`/opt/homebrew/opt/node@22/bin/node`).
Proper fix lives upstream in googleapis' tree; not trivially patchable here.
