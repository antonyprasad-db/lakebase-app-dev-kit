// replay-env: the drive's ENVIRONMENT/replay settings for a driver-turn sweep, resolved as
// "RECORDED baseline + overridable lever". The sweep REPLAYS a recorded corpus run; every
// environment setting therefore DEFAULTS to what that run recorded (curated into the bundle as
// recorded-run-config.json), and a candidate may OVERRIDE any of them via its RoleLeverPatch env
// levers. NOTHING is hardcoded , the recorded run-config is the single source of truth for the
// baseline; the lever is the only thing that deviates from it.
//
// This is deliberately a SEPARATE, dependency-light module (fs only) so it is unit-testable without
// dragging in the live scaffold machinery, and so the "no-hardcode" contract has ONE home.
import { readFileSync } from "fs";

/** The environment/replay settings that DEFAULT to the recorded run-config and are lever-overridable.
 *  (Models + effort are NOT here , they are pure levers with no recorded baseline.) */
export interface RecordedReplayEnv {
  uiTrack: boolean;
  loopGranularity: "story" | "ac" | "hybrid-a";
  deployTarget: "local" | "workspace";
  buildSessionScope: "cycle" | "story";
  batchCap: number;
}

/** Read the RECORDED corpus run-config (the sweep's replay baseline) into the leverable env set.
 *  Reads the snake_case keys the corpus writes; falls back to the stockflow-shaped defaults only if a
 *  key is absent (a malformed/partial recording, not the expected happy path). */
export function readRecordedRunConfig(path: string): RecordedReplayEnv {
  const r = JSON.parse(readFileSync(path, "utf8")) as {
    ui_track?: boolean;
    loop_granularity?: string;
    deploy_target?: string;
    build_session_scope?: string;
    batch_cap?: number;
  };
  return {
    uiTrack: r.ui_track === true,
    loopGranularity: (r.loop_granularity as "story" | "ac" | "hybrid-a") ?? "story",
    deployTarget: (r.deploy_target as "local" | "workspace") ?? "local",
    buildSessionScope: (r.build_session_scope as "cycle" | "story") ?? "story",
    batchCap: typeof r.batch_cap === "number" ? r.batch_cap : 3,
  };
}

/** The gate APPROVER identity, DERIVED from the recorded run-config's `gates` mode , not a literal.
 *  `gates: "proxy"` (the only headless-viable mode; interactive gates cannot run in an unattended
 *  sweep) => the "human-proxy" approver that auto-approves the recorded gate history. Deliberately NOT
 *  a lever: interactive gates would deadlock a headless run. */
export function readRecordedApprover(path: string): string {
  const r = JSON.parse(readFileSync(path, "utf8")) as { gates?: string };
  if (r.gates && r.gates !== "proxy") {
    throw new Error(`recorded gates=${r.gates}: only "proxy" gates are headless-viable for the sweep`);
  }
  return "human-proxy";
}

/** Resolve the drive's env settings: the RECORDED value by default, OVERRIDDEN by the candidate's env
 *  levers when present. This is the "recorded baseline + overridable lever" contract , the ONLY place
 *  a sweep's environment may deviate from the recording is an explicit lever. */
export function resolveReplayEnv(path: string, lever?: Partial<RecordedReplayEnv>): RecordedReplayEnv {
  const rec = readRecordedRunConfig(path);
  return {
    uiTrack: lever?.uiTrack ?? rec.uiTrack,
    loopGranularity: lever?.loopGranularity ?? rec.loopGranularity,
    deployTarget: lever?.deployTarget ?? rec.deployTarget,
    buildSessionScope: lever?.buildSessionScope ?? rec.buildSessionScope,
    batchCap: lever?.batchCap ?? rec.batchCap,
  };
}
