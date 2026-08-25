// Unit coverage for the per-turn meta -> consort.turn span mapper (turn-meta.ts).
// The mapper is the SINGLE place a concrete model id / effort lever is coarsened
// into the closed allowlist enums; these tests pin the family bucketing, the
// "no lever" vs "unknown lever" distinction, and the omit-when-absent contract.

import { describe, it, expect } from "vitest";
import { bucketModel, normalizeEffort, turnSpanFieldsFromMeta } from "../../consort/telemetry/turn-meta";
import { MODEL_VALUES, EFFORT_VALUES } from "../../consort/telemetry/allowlist";

describe("bucketModel: coarsen a concrete model id to the MODEL_VALUES family", () => {
  it("buckets each family by substring, robust to id decorations", () => {
    // Real-world id shapes: bare, dated, system-prefixed, window-tagged.
    expect(bucketModel("claude-opus-4-8")).toBe("opus");
    expect(bucketModel("system.ai.claude-opus-4-8[1m]")).toBe("opus");
    expect(bucketModel("claude-sonnet-5")).toBe("sonnet");
    expect(bucketModel("claude-haiku-4-5-20251001")).toBe("haiku");
    expect(bucketModel("claude-fable-5")).toBe("fable");
  });
  it("is case-insensitive", () => {
    expect(bucketModel("CLAUDE-OPUS-4-8")).toBe("opus");
  });
  it("an unrecognized id buckets as 'other' (never the raw id)", () => {
    const b = bucketModel("gpt-4o-mini");
    expect(b).toBe("other");
    expect(MODEL_VALUES).toContain(b);
  });
  it("absent/empty id yields undefined (span omits the field)", () => {
    expect(bucketModel(undefined)).toBeUndefined();
    expect(bucketModel("")).toBeUndefined();
    expect(bucketModel("   ")).toBeUndefined();
  });
});

describe("normalizeEffort: coarsen the effort lever to EFFORT_VALUES", () => {
  it("passes through the known levers (case/space tolerant)", () => {
    expect(normalizeEffort("low")).toBe("low");
    expect(normalizeEffort("Medium")).toBe("medium");
    expect(normalizeEffort(" HIGH ")).toBe("high");
  });
  it("a lever we saw but cannot classify buckets as 'unknown'", () => {
    const e = normalizeEffort("turbo");
    expect(e).toBe("unknown");
    expect(EFFORT_VALUES).toContain(e);
  });
  it("absent/empty lever yields undefined (no lever = model default, distinct from 'unknown')", () => {
    expect(normalizeEffort(undefined)).toBeUndefined();
    expect(normalizeEffort("")).toBeUndefined();
    expect(normalizeEffort("  ")).toBeUndefined();
  });
});

describe("turnSpanFieldsFromMeta: build the optional span fields from a recorded meta", () => {
  it("populates model + effort from a full meta", () => {
    expect(turnSpanFieldsFromMeta({ role: "driver", model: "claude-opus-4-8", effort: "high" })).toEqual({
      model: "opus",
      effort: "high",
    });
  });
  it("omits fields the runner did not surface (no key, not a null value)", () => {
    // model present, effort absent => only model set (effort omitted, a null column).
    expect(turnSpanFieldsFromMeta({ role: "driver", model: "claude-sonnet-5" })).toEqual({ model: "sonnet" });
    // both absent => empty object (turn span keeps only role + timing).
    expect(turnSpanFieldsFromMeta({ role: "driver" })).toEqual({});
  });
  it("undefined meta yields an empty object (best-effort read may find nothing)", () => {
    expect(turnSpanFieldsFromMeta(undefined)).toEqual({});
  });
});
