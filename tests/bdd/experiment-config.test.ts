// The externalized experiment config: an experiment is declarative data (a corpus turn + candidates +
// levers), loaded + normalized to the harness RoleCandidate shape. Guards the loader contract + that the
// shipped driver-green-ctx-test config parses (so the config + loader never drift).
import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { loadExperimentConfig, driverTurnFromLabel, roleFromLabel, substrateForRole, discriminatorFromLabel } from "../optimization/experiment-config";

function write(obj: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), "exp-cfg-"));
  const p = join(dir, "exp.json");
  writeFileSync(p, JSON.stringify(obj));
  return p;
}

describe("experiment-config: driverTurnFromLabel", () => {
  it("derives the turn kind from the corpus turn label", () => {
    expect(driverTurnFromLabel("0156-driver")).toBe("green");
    expect(driverTurnFromLabel("0158-driver-repair")).toBe("repair");
    expect(driverTurnFromLabel("0160-driver-refactor")).toBe("refactor");
  });
});

describe("experiment-config: discriminatorFromLabel", () => {
  it("maps a plain navigator BUILD turn to the RED coverage discriminator", () => {
    expect(discriminatorFromLabel("0088-navigator")).toBe("red");
    expect(discriminatorFromLabel("0020-navigator")).toBe("red");
  });
  it("maps navigator-assess to assess and refactor/review to review", () => {
    expect(discriminatorFromLabel("0157-navigator-assess")).toBe("assess");
    expect(discriminatorFromLabel("0160-driver-refactor")).toBe("review");
    expect(discriminatorFromLabel("0162-navigator-review")).toBe("review");
  });
});

describe("experiment-config: ac is optional for a RED (story-scoped) turn", () => {
  it("a red config parses with NO ac (defaults to empty)", () => {
    const cfg = loadExperimentConfig(write({ name: "r", turn: "0088-navigator", discriminator: "red", candidates: [{ id: "opus", levers: { model: "opus" } }] }));
    expect(cfg.discriminator).toBe("red");
    expect(cfg.ac).toBe("");
    expect(cfg.substrate).toBe("lean");
  });
  it("a non-red config still REQUIRES ac", () => {
    expect(() => loadExperimentConfig(write({ name: "a", turn: "0157-navigator-assess", candidates: [{ id: "opus", levers: {} }] }))).toThrow(/missing "ac"/);
  });
  it("a REFACTOR turn is also story-scoped => ac is optional (the whole story is reviewed + refactored)", () => {
    const cfg = loadExperimentConfig(write({ name: "rf", turn: "0039-driver-refactor", candidates: [{ id: "sonnet", levers: { model: "sonnet" } }] }));
    expect(cfg.driverTurn).toBe("refactor");
    expect(cfg.discriminator).toBe("review"); // refactor's next-step evaluator is a review
    expect(cfg.ac).toBe("");
    expect(cfg.substrate).toBe("cloud"); // driver turn
  });
});

describe("experiment-config: role + substrate (one config for every turn)", () => {
  it("derives the role from any turn label (multi-segment roles included)", () => {
    expect(roleFromLabel("0156-driver")).toBe("driver");
    expect(roleFromLabel("0037-navigator-assess")).toBe("navigator");
    expect(roleFromLabel("0006-ux-designer")).toBe("ux-designer");
    expect(roleFromLabel("0042-spec-author")).toBe("spec-author");
    expect(roleFromLabel("0044-architect-reviewer")).toBe("architect-reviewer");
    expect(() => roleFromLabel("0001-nope")).toThrow(/no known role/);
  });
  it("maps role -> substrate: driver=cloud, everything else=lean (the one switch)", () => {
    expect(substrateForRole("driver")).toBe("cloud");
    expect(substrateForRole("navigator")).toBe("lean");
    expect(substrateForRole("test-strategist")).toBe("lean");
    expect(substrateForRole("ux-designer")).toBe("lean");
  });
  it("loadExperimentConfig exposes derived role + substrate", () => {
    const cfg = loadExperimentConfig(join(__dirname, "../../examples/replay/optimize-experiments/driver-green-ctx-test.json"));
    expect(cfg.role).toBe("driver");
    expect(cfg.substrate).toBe("cloud");
  });
});

describe("experiment-config: loadExperimentConfig", () => {
  it("normalizes candidates to RoleCandidate + maps context.append -> ctxPack", () => {
    const cfg = loadExperimentConfig(
      write({
        name: "x",
        turn: "0156-driver",
        ac: "AC1-detail-view-shows-batch-and-serial",
        concurrency: 2,
        candidates: [
          { id: "opus-e-medium", levers: { model: "opus", effort: "medium" } },
          { id: "opus-ctx", levers: { model: "opus", context: { mode: "append", include: ["failing-test"] } } },
        ],
      }),
    );
    expect(cfg.driverTurn).toBe("green"); // derived from the label
    expect(cfg.concurrency).toBe(2);
    expect(cfg.roleCandidates).toHaveLength(2);
    expect(cfg.roleCandidates[0]).toEqual({ id: "opus-e-medium", levers: { model: "opus", effort: "medium" } });
    // context.append normalized to the ctxPack lever the driver cfg appends via contextPackSuffix
    expect(cfg.roleCandidates[1].levers).toMatchObject({ model: "opus", ctxPack: ["failing-test"] });
  });

  it("rejects malformed configs + context.replace (not yet dispatchable)", () => {
    expect(() => loadExperimentConfig(write({ turn: "0156-driver", ac: "x", candidates: [{ id: "a", levers: {} }] }))).toThrow(/missing "name"/);
    expect(() => loadExperimentConfig(write({ name: "x", ac: "x", candidates: [{ id: "a", levers: {} }] }))).toThrow(/missing "turn"/);
    expect(() => loadExperimentConfig(write({ name: "x", turn: "t", ac: "x", candidates: [] }))).toThrow(/non-empty array/);
    expect(() => loadExperimentConfig(write({ name: "x", turn: "t", ac: "x", candidates: [{ id: "a", levers: {} }, { id: "a", levers: {} }] }))).toThrow(/duplicate candidate id/);
    expect(() =>
      loadExperimentConfig(write({ name: "x", turn: "t", ac: "x", candidates: [{ id: "a", levers: { context: { mode: "replace", bundle: "lean" } } }] })),
    ).toThrow(/not yet dispatchable/);
  });

  it("the shipped driver-green-ctx-test config parses + carries the ctx-test append candidate", () => {
    const cfg = loadExperimentConfig(join(__dirname, "../../examples/replay/optimize-experiments/driver-green-ctx-test.json"));
    expect(cfg.turn).toBe("0156-driver");
    expect(cfg.driverTurn).toBe("green");
    const ctx = cfg.roleCandidates.find((c) => c.id === "opus-e-medium-ctx-test");
    expect(ctx?.levers).toMatchObject({ model: "opus", effort: "medium", ctxPack: ["failing-test"] });
  });

  it("the shipped navigator-red-panel config parses as a lean RED sweep (story-scoped, no ac)", () => {
    const cfg = loadExperimentConfig(join(__dirname, "../../examples/replay/optimize-experiments/navigator-red-panel.json"));
    expect(cfg.turn).toBe("0088-navigator");
    expect(cfg.discriminator).toBe("red");
    expect(cfg.role).toBe("navigator");
    expect(cfg.substrate).toBe("lean");
    expect(cfg.roleCandidates.map((c) => c.id)).toEqual(["opus", "sonnet", "sonnet-e-low", "haiku", "haiku-e-low"]);
  });
});
