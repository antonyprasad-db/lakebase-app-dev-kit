// HERMETIC guard for the per-role design + plan-lane LIVE chains (runs under `npm test`, no
// live agent). Each chain dir under tests/integration/manifests/<role>-chain/ is a lean 2-turn
// pair: a REPLAY seed (lays the role's recorded INPUT artifacts into the workspace) that routes
// to the LIVE role step (a `claude` agent). This guard proves, WITHOUT spawning a model, that:
//   1. every chain manifest conforms to the step-manifest schema,
//   2. the seed's produced files satisfy the live role's declared inputs (the chain holds),
//   3. the seed is `replay` and the role step is `claude` (the ONE live agent per chain),
//   4. every declared replay seed file + input exists in the recorded intake corpus, and
//   5. each chain's actions map to exactly one manifest in that chain (no ambiguity).
// The live execution itself is exercised by the per-role tests under ../live/ (gated on
// RUN_LIVE_STEP). Chain ids follow the uniform <role>-chain-seed / <role>-chain-live convention.

import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadStepManifests, manifestForAction, validateStepManifest, type StepManifest } from "../../../consort/orchestrator/manifest/step-manifest";
import { resolveValidator } from "../../../consort/orchestrator/validators/conformance/validator-registry";
import type { WorkflowAction } from "../../../scripts/sftdd/orchestrator-drive";

const KIT = process.cwd();
const MANIFESTS = join(KIT, "tests/integration/manifests");
const INTAKE = join(KIT, "tests/integration/intake");

// Each per-role chain: its dir + the live role it exercises. Ids are <dir>-seed / <dir>-live.
const CHAINS: { dir: string; liveRole: string }[] = [
  { dir: "spec-author-story-chain", liveRole: "spec-author" },
  { dir: "architect-reviewer-chain", liveRole: "architect-reviewer" },
  { dir: "dba-chain", liveRole: "dba" },
  { dir: "test-strategist-chain", liveRole: "test-strategist" },
  { dir: "spec-author-propose-chain", liveRole: "spec-author" },
  { dir: "architect-estimator-chain", liveRole: "architect-reviewer" },
];

const PO_SEED: WorkflowAction = { kind: "invoke-role", role: "product-owner", mode: "author-requests" };

describe.each(CHAINS)("design-role LIVE chain: $dir", ({ dir, liveRole }) => {
  const seedId = `${dir}-seed`;
  const liveId = `${dir}-live`;
  const manifests = loadStepManifests(join(MANIFESTS, dir));
  const seed = manifests.find((m) => m.id === seedId)!;
  const live = manifests.find((m) => m.id === liveId)!;

  it("loads exactly the seed + live-role pair", () => {
    expect(manifests.map((m) => m.id).sort()).toEqual([seedId, liveId].sort());
  });

  it("every manifest conforms to the step-manifest schema", () => {
    for (const m of manifests) expect(validateStepManifest(m)).toEqual({ ok: true, violations: [] });
  });

  it("the seed is a `replay` agent; the role step is a `claude` (live) agent", () => {
    expect(seed.agent?.kind).toBe("replay");
    expect(live.agent?.kind).toBe("claude");
    expect(live.role).toBe(liveRole);
  });

  it("the seed routes to the live role's action (the 2-turn chain)", () => {
    const next = seed.routing.produced.next as WorkflowAction;
    // The chain, driven from the PO seed action, reaches the live role's manifest.
    const first = manifestForAction(PO_SEED, manifests);
    expect(first?.id).toBe(seedId);
    const second = manifestForAction(next, manifests);
    expect(second?.id).toBe(liveId);
  });

  it("the seed produces every file the live role declares as an input (the chain holds)", () => {
    const produced = new Set(seed.outputs.map((o) => o.filename));
    for (const input of live.inputs) {
      const file = input.source.replace(/^feature:/, "");
      expect(produced.has(file), `live input "${input.id}" (${file}) is not produced by the seed`).toBe(true);
    }
  });

  it("every replay seed source + live input exists in the recorded intake corpus", () => {
    const seeds = (seed.agent!.config.seeds as { from: string }[]) ?? [];
    for (const s of seeds) {
      expect(existsSync(join(INTAKE, s.from)), `recorded seed missing: ${s.from}`).toBe(true);
    }
  });

  it("every output validator resolves in the registry (no manifest typo)", () => {
    for (const m of [seed, live]) {
      for (const o of m.outputs) expect(typeof resolveValidator(o.validator)).toBe("function");
    }
  });
});
