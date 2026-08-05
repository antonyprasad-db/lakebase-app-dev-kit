// escalation-probe: the "derive DriveState from disk" adapter that lets the standalone manifest
// runner reach the revise/escalate route space. It delegates to the legacy diskArtifactProbe
// authority, so this pins the two classifications the runner cares about:
//   - a spec-level smell escalation with a story + budget left  => ROUTABLE (-> revise-route).
//   - a non-smell (explicit / build-level) escalation           => terminal (-> raise-to-hil).
// Hermetic: writes real escalation files into a temp .sftdd/escalations and reads them back.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { writeEscalation } from "../../consort/gates/escalation";
import { deriveEscalation, probeDriveState } from "../../consort/orchestrator/state/escalation-probe";

let root: string;
let sftddDir: string;
const FEATURE = "F1-stock-visibility";
const STORY = "S1-stock-list";

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "esc-probe-"));
  sftddDir = join(root, ".sftdd");
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("escalation-probe: deriveEscalation (reuses the legacy disk authority)", () => {
  it("returns null when there is no escalation on disk", () => {
    expect(deriveEscalation(sftddDir, FEATURE)).toBeNull();
  });

  it("classifies a SPEC-level smell escalation (with a story) as ROUTABLE -> revise-route", () => {
    // A reflect-spec-defect is a spec-author-owned smell; first revise is always allowed, so the
    // probe marks it routable to the spec gate.
    writeEscalation(sftddDir, {
      source: "smell:reflect-spec-defect",
      reason: "AC2 is untestable as written",
      feature_id: FEATURE,
      story_id: STORY,
    });
    const e = deriveEscalation(sftddDir, FEATURE);
    expect(e, "expected an escalation").not.toBeNull();
    expect(e!.source).toBe("smell:reflect-spec-defect");
    expect(e!.routable).toEqual({ story: STORY, owning_role: "spec-author", gate: "spec" });
  });

  it("classifies a NON-smell (explicit) escalation as terminal -> NOT routable (raise-to-hil)", () => {
    writeEscalation(sftddDir, {
      source: "honest-green",
      reason: "verify failed on main",
      feature_id: FEATURE,
      story_id: STORY,
    });
    const e = deriveEscalation(sftddDir, FEATURE);
    expect(e, "expected an escalation").not.toBeNull();
    expect(e!.source).toBe("honest-green");
    expect(e!.routable).toBeUndefined();
  });
});

describe("escalation-probe: probeDriveState", () => {
  it("with no escalation, yields a feature-phase state with escalation:null (byte-identical stub)", () => {
    const s = probeDriveState(sftddDir, FEATURE);
    expect(s.phase).toBe("feature");
    expect(s.escalation).toBeNull();
  });

  it("carries the derived escalation onto the state the runner routes against", () => {
    writeEscalation(sftddDir, {
      source: "smell:reflect-spec-defect",
      reason: "AC2 untestable",
      feature_id: FEATURE,
      story_id: STORY,
    });
    const s = probeDriveState(sftddDir, FEATURE);
    expect(s.escalation?.routable?.owning_role).toBe("spec-author");
  });
});
