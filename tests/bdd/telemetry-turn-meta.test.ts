// Unit coverage for the per-turn meta -> consort.turn span mapper (turn-meta.ts).
// The mapper is the SINGLE place a concrete model id / effort lever is coarsened
// into the closed allowlist enums; these tests pin the family bucketing, the
// "no lever" vs "unknown lever" distinction, and the omit-when-absent contract.

import { describe, it, expect } from "vitest";
import { bucketModel, normalizeEffort, bucketTokens, turnSpanFieldsFromMeta, TOKEN_BUCKET_THRESHOLDS } from "../../consort/telemetry/turn-meta";
import { MODEL_VALUES, EFFORT_VALUES, TOKEN_BUCKET_VALUES } from "../../consort/telemetry/allowlist";

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

describe("bucketTokens: coarsen a turn's processed tokens to a TOKEN_BUCKET band", () => {
  it("buckets input+output totals across the band boundaries (exclusive upper bounds)", () => {
    const b = (i: number, o = 0) => bucketTokens({ inputTokens: i, outputTokens: o });
    expect(b(1)).toBe("xs");
    expect(b(24_999)).toBe("xs");
    expect(b(25_000)).toBe("s"); // boundary is exclusive on xs
    expect(b(40_000, 3_000)).toBe("s"); // 43k total
    expect(b(74_999)).toBe("s");
    expect(b(75_000)).toBe("m");
    expect(b(199_999)).toBe("m");
    expect(b(200_000)).toBe("l");
    expect(b(499_999)).toBe("l");
    expect(b(500_000)).toBe("xl");
    expect(b(5_000_000)).toBe("xl"); // open-ended top
  });
  it("EXCLUDES cache-read tokens (reused context, not fresh work)", () => {
    // A warm resume: tiny fresh input+output but a huge cache read stays 'xs'.
    expect(bucketTokens({ inputTokens: 500, outputTokens: 800, cacheReadTokens: 900_000 })).toBe("xs");
  });
  it("absent usage or non-positive total yields undefined (span omits the field)", () => {
    expect(bucketTokens(undefined)).toBeUndefined();
    expect(bucketTokens({ inputTokens: 0, outputTokens: 0 })).toBeUndefined();
  });
  it("every threshold bucket is a valid TOKEN_BUCKET_VALUES member", () => {
    for (const t of TOKEN_BUCKET_THRESHOLDS) expect(TOKEN_BUCKET_VALUES).toContain(t.bucket);
  });
});

describe("turnSpanFieldsFromMeta: build the optional span fields from a recorded meta", () => {
  it("populates model + effort + token_bucket + retry_count from a full meta", () => {
    expect(
      turnSpanFieldsFromMeta({
        role: "driver",
        model: "claude-opus-4-8",
        effort: "high",
        retryCount: 2,
        usage: { inputTokens: 90_000, outputTokens: 5_000 },
      }),
    ).toEqual({
      model: "opus",
      effort: "high",
      token_bucket: "m",
      token_bucket_input: "m", // 90k
      token_bucket_output: "xs", // 5k
      retry_count: 2,
    });
  });
  it("carries retry_count: 0 as a real measurement (clean turn, distinct from omitted/null)", () => {
    expect(turnSpanFieldsFromMeta({ role: "driver", retryCount: 0 })).toEqual({ retry_count: 0 });
  });
  it("omits fields the runner did not surface (no key, not a null value)", () => {
    // model present, effort + usage + retryCount absent => only model set (others null columns).
    expect(turnSpanFieldsFromMeta({ role: "driver", model: "claude-sonnet-5" })).toEqual({ model: "sonnet" });
    // all absent => empty object (turn span keeps only role + timing).
    expect(turnSpanFieldsFromMeta({ role: "driver" })).toEqual({});
  });
  it("ignores a malformed retryCount (negative / non-finite) rather than shipping it", () => {
    expect(turnSpanFieldsFromMeta({ role: "driver", retryCount: -1 })).toEqual({});
    expect(turnSpanFieldsFromMeta({ role: "driver", retryCount: NaN })).toEqual({});
  });
  it("undefined meta yields an empty object (best-effort read may find nothing)", () => {
    expect(turnSpanFieldsFromMeta(undefined)).toEqual({});
  });
});
