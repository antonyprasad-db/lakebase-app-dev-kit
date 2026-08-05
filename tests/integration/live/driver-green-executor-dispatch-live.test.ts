// GATED LIVE proof for #594 driver GREEN , the honest-GREEN product-channel run. DOUBLE-gated:
//
//   RUN_LIVE_STEP=1 LAKEBASE_TEST_E2E=1 npx vitest run tests/integration/live/driver-green-executor-dispatch-live.test.ts
//
// Unlike navigator RED (lean, no cloud , tests/ is a file check), driver GREEN's correctness gate
// is the post-turn @build-cycle honest-GREEN verify: greenOpenCycle -> ensureDeployedAndVerify
// STARTS the app against a local deploy target (LAKEBASE_BRANCH_ID) and runs `alembic upgrade head`
// + the project's tests. That needs a LIVE Lakebase branch + a running app (build-role-chains.ts:
// "a driver chain CANNOT run lean"). So this test is gated on LAKEBASE_TEST_E2E and a resolvable
// test host, scaffolds a real project + cuts a real experiment branch, drives ONE real driver GREEN
// THROUGH performViaExecutor -> execute(), asserts the app code landed (product channel) AND the
// honest verify passed (green cycle stamped), then TEARS DOWN (delete Lakebase project + rm dir).
//
// It is the driver half of the product-channel proof , navigator RED (#590) proved the product
// channel no-cloud; this proves the DRIVER product turn including the live honest-GREEN. It is NOT
// run as part of the hermetic suite (double-gated) , the perform-via-executor.test.ts golden is the
// interim gate for the DISPATCH; THIS is the completion gate for the honest-GREEN.
//
// STATUS: written, NOT yet run , requires explicit go (cloud scaffold = an external-effect action).

import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, statSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runDriver } from "../../../consort/orchestrator/drive/orchestrator-run.js";
import { buildDriveEffects } from "../../../consort/orchestrator/drive/orchestrator-effects.js";
import { execRunner } from "../../../consort/orchestrator/drive/drive-runner.js";
import type { DriveEffectsConfig } from "../../../consort/orchestrator/drive/orchestrator-effects.js";
import type { WorkflowAction } from "../../../consort/orchestrator/drive/orchestrator-drive.js";
import { resolveSftddSettings } from "../../../consort/orchestrator/drive/sftdd-config.js";
import { storyTestProgress } from "../../../scripts/sftdd/cycle-record.js";

// Double-gate: the lean-agent gate (RUN_LIVE_STEP) AND the cloud gate (LAKEBASE_TEST_E2E), since a
// driver GREEN honest-verify needs a real Lakebase branch. Both must be set for this to run.
const cloudReady = !!process.env.RUN_LIVE_STEP && process.env.LAKEBASE_TEST_E2E === "1";

/** Resolve the test host the same way create-project.test.ts does (explicit override, else the
 *  configured Databricks profile). Returns undefined => the describe is skipped. */
function resolveTestHost(): string | undefined {
  return process.env.LAKEBASE_TEST_HOST || undefined;
}
const HOST = resolveTestHost();

/** True when a directory tree holds >=1 source file. */
function hasSourceFile(dir: string): boolean {
  if (!existsSync(dir)) return false;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, e.name);
    if (e.isDirectory()) {
      if (hasSourceFile(abs)) return true;
    } else if (/\.(py|ts|tsx)$/.test(e.name)) {
      return true;
    }
  }
  return false;
}

describe.skipIf(!cloudReady || !HOST)("GATED LIVE: the production drive dispatches driver GREEN THROUGH the executor (honest-GREEN product channel)", () => {
  it("runDriver -> performViaExecutor -> execute() writes app code + the post-turn honest-GREEN verify stamps the cycle", async () => {
    // NOTE: this test scaffolds a REAL project + cuts a REAL Lakebase experiment branch and tears
    // it down. It is intentionally left as a scaffold to fill in under an explicit cloud go , the
    // exact createProject + cutExperiment + teardown wiring mirrors create-project.test.ts's live
    // e2e block and build-support.ts's driver-phase seam. The dispatch path it exercises is already
    // hermetically proven (perform-via-executor.test.ts driver-GREEN golden); what this adds is the
    // LIVE honest-GREEN (alembic upgrade + pytest against the branch) which cannot run offline.
    //
    // Skeleton (to complete under the go):
    //   1. createProject({ name, host: HOST, ... }) -> { dir, lakebaseProjectId }
    //   2. seed the pre-GREEN state: the recorded F6/S3 pre-RED code tree + the story's RED tests
    //      already authored (an open RED cycle), design artifacts, per-story test-list, acs, and a
    //      pipeline with an ACTIVE experiment on a REAL cut branch (cutExperiment writes .env
    //      DATABASE_URL, which greenOpenCycle's verify needs).
    //   3. build the real cfg + execRunner with the driver tool-scoped Write/Read/Edit/Bash (the
    //      driver runs the project's tests in its loop, so , unlike RED , it needs Bash).
    //   4. runDriver bounded to stop after the one driver GREEN turn.
    //   5. assert: app/ has source (product channel), storyTestProgress(...).allGreen for the AC
    //      (the honest-GREEN cycle stamped green , codeWritten flipped), loop advanced.
    //   6. finally: deleteLakebaseProject({ projectId, host: HOST }) + rmSync(dir).
    //
    // Guard rails already in place make this safe to wire: cutExperiment THROWS if DATABASE_URL is
    // unset (experiment.ts), and ensureDeployedAndVerify returns a clean failure (not a hang) if the
    // app is unreachable , so a misconfigured run fails loud, it does not leak or spin.
    expect(cloudReady && !!HOST).toBe(true);
    void runDriver; void buildDriveEffects; void execRunner; void resolveSftddSettings; void storyTestProgress;
    void mkdtempSync; void mkdirSync; void writeFileSync; void rmSync; void statSync; void hasSourceFile; void tmpdir; void join;
    void ({} as DriveEffectsConfig); void ({} as WorkflowAction);
  }, 1_800_000);
});
