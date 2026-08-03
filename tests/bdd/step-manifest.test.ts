// step-manifest: a per-step JSON manifest is the DATA face of a step , its logical
// inputs, its outputs (+ checker NAMES), its routing map, its agent levers, and any
// post-turn CLIs. The Template Method (StepExecutor) reads the manifest to drive the
// fixed phases; only checker fn bodies + the agent spawn stay code. This slice pins the
// schema (shape) + the loader (indexing an action -> its single manifest, rejecting an
// ambiguous overlap). Resolving a checker NAME to its fn is the registry's job (Slice 1),
// so an unknown checker name is validated THERE, not here.

import { describe, it, expect } from "vitest";
import {
  validateStepManifest,
  loadStepManifests,
  manifestForAction,
  matchesAction,
} from "../../scripts/sftdd/step-manifest";
import type { StepManifest } from "../../scripts/sftdd/step-manifest";
import type { WorkflowAction } from "../../scripts/sftdd/orchestrator-drive";

/** A minimal, shape-conformant manifest builder for negative tests. */
function manifest(over: Partial<StepManifest> = {}): StepManifest {
  return {
    id: "spec-author-breakdown",
    role: "spec-author",
    match: { kind: "invoke-role", role: "spec-author", mode: "breakdown" },
    inputs: [
      { id: "product-overview", source: "feature:product-overview.md", description: "PO product overview" },
      { id: "nfrs", source: "feature:nfrs.md", description: "PO NFRs" },
      { id: "feature-request", source: "feature:feature-request.md", description: "PO feature request" },
    ],
    outputs: [
      { id: "feature-spec", filename: "feature-spec.json", checker: "featureSpecNonEmptyStories" },
      { id: "agent-log", filename: "agent-log.jsonl", checker: "agentLogHasRoleEvent" },
    ],
    routing: { produced: { next: { kind: "design-complete" } } },
    agentOptions: { model: "sonnet", effort: "low", session: "fresh", resumeKeyFrom: "role" },
    ...over,
  } as StepManifest;
}

const BREAKDOWN: WorkflowAction = { kind: "invoke-role", role: "spec-author", mode: "breakdown" };

describe("step-manifest schema (shape)", () => {
  it("accepts a fully-formed breakdown manifest", () => {
    const r = validateStepManifest(manifest());
    expect(r).toEqual({ ok: true, violations: [] });
  });

  it("rejects a manifest missing a required top-level field (bad shape)", () => {
    const { role: _omit, ...noRole } = manifest();
    const r = validateStepManifest(noRole as unknown as StepManifest);
    expect(r.ok).toBe(false);
    expect(r.violations.join(" ")).toMatch(/role/i);
  });

  it("rejects an output missing its checker name (every output ships a checker)", () => {
    const bad = manifest({
      outputs: [{ id: "feature-spec", filename: "feature-spec.json" } as never],
    });
    const r = validateStepManifest(bad);
    expect(r.ok).toBe(false);
    expect(r.violations.join(" ")).toMatch(/checker/i);
  });

  it("rejects an input missing its .sftdd source", () => {
    const bad = manifest({
      inputs: [{ id: "product-overview", description: "x" } as never],
    });
    const r = validateStepManifest(bad);
    expect(r.ok).toBe(false);
    expect(r.violations.join(" ")).toMatch(/source/i);
  });

  it("rejects an unknown extra top-level field (additionalProperties:false)", () => {
    const r = validateStepManifest(manifest({ bogus: 1 } as never));
    expect(r.ok).toBe(false);
  });
});

describe("step-manifest loader: the real breakdown manifest ships + validates", () => {
  it("loads every step-manifests/*.json and they all conform to the schema", () => {
    const manifests = loadStepManifests();
    expect(manifests.length).toBeGreaterThanOrEqual(1);
    for (const m of manifests) {
      expect(validateStepManifest(m)).toEqual({ ok: true, violations: [] });
    }
  });

  it("ships the spec-author-breakdown manifest", () => {
    const ids = loadStepManifests().map((m) => m.id);
    expect(ids).toContain("spec-author-breakdown");
  });
});

describe("step-manifest matchesAction (strict subset-match)", () => {
  it("matches when every match field equals the action's field", () => {
    expect(matchesAction(manifest().match, BREAKDOWN)).toBe(true);
  });

  it("does NOT match when a match field differs", () => {
    const propose: WorkflowAction = { kind: "invoke-role", role: "spec-author", mode: "propose" };
    expect(matchesAction(manifest().match, propose)).toBe(false);
  });

  it("does NOT match a different action kind", () => {
    expect(matchesAction(manifest().match, { kind: "planning-complete" } as WorkflowAction)).toBe(false);
  });

  it("a coarser match (kind only) matches any action of that kind", () => {
    const coarse = { kind: "invoke-role" };
    const anyInvoke: WorkflowAction = { kind: "invoke-role", role: "driver", story: "S1" } as WorkflowAction;
    expect(matchesAction(coarse, anyInvoke)).toBe(true);
  });
});

describe("step-manifest manifestForAction (single-match, rejects ambiguity)", () => {
  it("returns the single manifest matching an action", () => {
    const m = manifestForAction(BREAKDOWN, [manifest()]);
    expect(m?.id).toBe("spec-author-breakdown");
  });

  it("returns undefined when no manifest matches", () => {
    const m = manifestForAction({ kind: "planning-complete" } as WorkflowAction, [manifest()]);
    expect(m).toBeUndefined();
  });

  it("THROWS loud when two manifests match the same action (ambiguous overlap)", () => {
    const a = manifest({ id: "a" });
    const b = manifest({ id: "b" }); // same match => both hit BREAKDOWN
    expect(() => manifestForAction(BREAKDOWN, [a, b])).toThrow(/ambiguous|multiple|a.*b|b.*a/i);
  });

  it("uses the shipped manifests when no explicit list is passed", () => {
    const m = manifestForAction(BREAKDOWN);
    expect(m?.id).toBe("spec-author-breakdown");
  });
});
