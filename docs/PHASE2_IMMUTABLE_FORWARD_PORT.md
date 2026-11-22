# Project 9 — Phase 2 immutable StarNet mission: clean forward-port

## Scope and lineage

This branch starts from main `3e40a3a04fed35ca59505443f0d5e1b6c7a03b36`.
It forward-ports only the original Phase 2 input-snapshot implementation from
`bf600c3ae1a7c9c189d8b94cb48291f47ba9bbd6`, with a new negative
regression test. Do **not** merge the older draft PR #63 as a substitute:
its full diff includes unrelated synthetic-session/workstation changes from
an obsolete feature lineage.

- Capture and validate each local JSON data file **once** into a deeply frozen
  memory snapshot linked to SHA-256 of its original bytes.
- Pass the same snapshot to the market readiness, regime and hypothetical
  paper-forward research stages.
- Verify that on-disk source bytes still match at stage boundaries and before
  publishing `latest.json` / `latest.md`.
- Preserve existing standalone CLI functions for the three research commands.
- Stop on invalid as-of dates and changed data; do not truncate, relabel, or
  silently regenerate existing data to obtain a PASS.

## Why StarNet's prior synthetic mission failed

The known fictional SIM09/SIM10 fixture generator starts on 2025-09-02
and creates 120 weekday bars, ending on **2026-02-16**. However,
`npm run demo:seed` intentionally preserves any existing `.data/SIM09.json`
and `.data/SIM10.json` files. A retained dataset with `sourceAsOf`
or a bar after 2026-02-16 correctly fails an audit requested
`--as-of 2026-02-16`. This is a **safety guard**, not permission to
rewrite existing local evidence.

To exercise the successful synthetic mission without editing `.data/`,
run the following **from a trusted checkout of this branch** with compatible
Node and npm. It seeds a separate OS temporary directory, executes research
only, and prints paths to the isolated reports:

```bash
node --input-type=module <<'NODE'
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {seedWorkstationDemo} from './scripts/seed-workstation-demo.mjs';
import {runStarNetMission} from './scripts/starnet-crew-mission.mjs';

const dataDir=await mkdtemp(join(tmpdir(),'p9-phase2-demo-'));
await seedWorkstationDemo({dataDir});
const output=await runStarNetMission({
  asOf:'2026-02-16',dataDir,demo:true
});
console.log(JSON.stringify({dataDir,...output},null,2));
NODE
```

No `--paper-auto` action is involved. These fixtures are made-up demonstrations,
not source-authenticated prices or evidence of research performance.

## Acceptance checklist

- [ ] GitHub Verify and Security Monitor pass on the **exact** final
  candidate SHA (PR-triggered checks).
- [ ] `npm run check` passes at the same SHA with its full test totals.
- [ ] Snapshot source-mutation, hash mismatch, captured-byte validation,
  nested immutability and **post-review as-of rejection** tests pass.
- [ ] Fresh isolated SIM09/SIM10 research run succeeds using the command above,
  with reports showing zero virtual paper tickets.
- [ ] Real Chromium workstation test passes on the exact integrated candidate,
  or remains explicitly NOT_RUN / skipped.
- [ ] Source authenticity, point-in-time acceptance, genuine market calendar,
  and authorized real-history review remain separate release gates (#43–#46/#53).

## Limitations

The optional `paperAuto` operator uses a separate workstation watchlist and
does not consume this research snapshot universe; it is **not accepted** by
this forward-port. The JSON and Markdown deliverables are replaced one at a time,
not in one atomic multi-file transaction. No local data, provider credentials,
brokerage connections, actual transactions, deployment, or scheduling is in
scope. Existing `.codex/CURRENT_TASK.md` remains untouched.
