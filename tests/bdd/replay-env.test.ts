// Enforces the driver-turn sweep's ENVIRONMENT contract: every replay setting DEFAULTS to the RECORDED
// corpus run-config and is OVERRIDABLE by a candidate lever , NOTHING is hardcoded. This test is the
// anti-recurrence guard for the repeated regression where env settings (esp. uiTrack) were pinned to a
// literal instead of read from the recording. If someone reintroduces a hardcode, resolveReplayEnv stops
// tracking the recording and these assertions fail.
import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { readRecordedRunConfig, readRecordedApprover, resolveReplayEnv, type RecordedReplayEnv } from "../optimization/replay-env";

// The real recorded run-config the driver-green bundle replays (curated into the setup bundle).
const REAL = join(__dirname, "../integration/live/driver-green-setup/recorded-run-config.json");

function writeConfig(obj: Record<string, unknown>): string {
  const dir = mkdtempSync(join(tmpdir(), "replay-env-"));
  const p = join(dir, "recorded-run-config.json");
  writeFileSync(p, JSON.stringify(obj));
  return p;
}

describe("replay-env: env settings track the RECORDED run-config (no hardcode)", () => {
  it("reads the leverable env set straight from the recording's snake_case keys", () => {
    const p = writeConfig({ ui_track: false, loop_granularity: "ac", deploy_target: "workspace", build_session_scope: "cycle", batch_cap: 7 });
    expect(readRecordedRunConfig(p)).toEqual<RecordedReplayEnv>({
      uiTrack: false,
      loopGranularity: "ac",
      deployTarget: "workspace",
      buildSessionScope: "cycle",
      batchCap: 7,
    });
  });

  it("the REAL stockflow recording resolves to its recorded values (full-stack => uiTrack true)", () => {
    // The recorded corpus is full-stack + story-loop + local + proxy-gated + batch 3. If any of these
    // drifts to a literal in the resolver, this pins it back to the recording.
    expect(resolveReplayEnv(REAL)).toEqual<RecordedReplayEnv>({
      uiTrack: true,
      loopGranularity: "story",
      deployTarget: "local",
      buildSessionScope: "story",
      batchCap: 3,
    });
    expect(readRecordedApprover(REAL)).toBe("human-proxy");
  });

  it("resolveReplayEnv defaults to the recording when NO lever is given", () => {
    const p = writeConfig({ ui_track: true, loop_granularity: "story", deploy_target: "local", build_session_scope: "story", batch_cap: 3 });
    expect(resolveReplayEnv(p)).toEqual(readRecordedRunConfig(p));
    expect(resolveReplayEnv(p, {})).toEqual(readRecordedRunConfig(p));
  });

  it("resolveReplayEnv lets a candidate lever OVERRIDE each field (recorded is only the baseline)", () => {
    const p = writeConfig({ ui_track: true, loop_granularity: "story", deploy_target: "local", build_session_scope: "story", batch_cap: 3 });
    expect(resolveReplayEnv(p, { uiTrack: false })).toMatchObject({ uiTrack: false, loopGranularity: "story" });
    expect(resolveReplayEnv(p, { loopGranularity: "hybrid-a", batchCap: 5 })).toMatchObject({ loopGranularity: "hybrid-a", batchCap: 5, uiTrack: true });
    expect(resolveReplayEnv(p, { deployTarget: "workspace", buildSessionScope: "cycle" })).toMatchObject({ deployTarget: "workspace", buildSessionScope: "cycle" });
  });

  it("a falsy override (uiTrack:false, batchCap:0) still wins over the recorded value (?? not ||)", () => {
    const p = writeConfig({ ui_track: true, batch_cap: 3 });
    expect(resolveReplayEnv(p, { uiTrack: false }).uiTrack).toBe(false);
    expect(resolveReplayEnv(p, { batchCap: 0 }).batchCap).toBe(0);
  });

  it("approver is DERIVED from recorded gates (proxy => human-proxy) and rejects non-headless gates", () => {
    expect(readRecordedApprover(writeConfig({ gates: "proxy" }))).toBe("human-proxy");
    expect(() => readRecordedApprover(writeConfig({ gates: "interactive" }))).toThrow(/headless-viable/);
  });
});
