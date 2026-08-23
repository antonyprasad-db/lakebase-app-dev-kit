// consortEnv: single-source env resolver with legacy back-compat + a one-time
// deprecation warning when a value resolves via a legacy sftdd/tdd-era prefix.

import { describe, it, expect, vi } from "vitest";
import { consortEnv, ENV_PREFIX, LEGACY_REMOVAL_VERSION } from "../../consort/config/consort-env.js";

function captureStderr(fn: () => void): string {
  const chunks: string[] = [];
  const spy = vi
    .spyOn(process.stderr, "write")
    .mockImplementation((s: string | Uint8Array) => {
      chunks.push(String(s));
      return true;
    });
  try {
    fn();
  } finally {
    spy.mockRestore();
  }
  return chunks.join("");
}

describe("consortEnv resolution + precedence", () => {
  it("prefers the canonical LAKEBASE_CONSORT_ prefix over legacy ones (no warning)", () => {
    const env = { LAKEBASE_CONSORT_ALPHA: "new", LAKEBASE_SFTDD_ALPHA: "old" } as NodeJS.ProcessEnv;
    let val: string | undefined;
    const err = captureStderr(() => {
      val = consortEnv("ALPHA", env);
    });
    expect(val).toBe("new");
    expect(err).toBe(""); // canonical resolution never warns
  });

  it("returns undefined for an unset knob (no warning)", () => {
    const err = captureStderr(() => {
      expect(consortEnv("BRAVO", {} as NodeJS.ProcessEnv)).toBeUndefined();
    });
    expect(err).toBe("");
  });
});

describe("consortEnv legacy deprecation warning", () => {
  it("resolves a legacy LAKEBASE_SFTDD_ value AND warns with the canonical name + removal version", () => {
    const env = { LAKEBASE_SFTDD_CHARLIE: "legacy" } as NodeJS.ProcessEnv;
    let val: string | undefined;
    const err = captureStderr(() => {
      val = consortEnv("CHARLIE", env);
    });
    expect(val).toBe("legacy"); // still honored
    expect(err).toContain("deprecated");
    expect(err).toContain("LAKEBASE_SFTDD_CHARLIE");
    expect(err).toContain(`${ENV_PREFIX}CHARLIE`);
    expect(err).toContain(LEGACY_REMOVAL_VERSION);
  });

  it("warns only once per distinct legacy name, even across repeated reads", () => {
    const env = { LAKEBASE_TDD_DELTA: "legacy" } as NodeJS.ProcessEnv;
    const err = captureStderr(() => {
      consortEnv("DELTA", env);
      consortEnv("DELTA", env);
      consortEnv("DELTA", env);
    });
    const occurrences = err.split("LAKEBASE_TDD_DELTA").length - 1;
    expect(occurrences).toBe(1);
  });
});
