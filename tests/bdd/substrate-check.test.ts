// The stale-substrate integrity gate: create-project must refuse to scaffold when
// the resolved nested @databricks-solutions/lakebase-scm-utils does not match the
// version this kit declares (the npx transitive-git-dep staleness that produced a
// broken project in the field).

import { describe, it, expect } from "vitest";
import { substrateMismatchMessage } from "../../consort/lakebase/substrate-check.js";

describe("substrateMismatchMessage", () => {
  it("passes (null) when declared == installed", () => {
    expect(substrateMismatchMessage({ declared: "0.2.3", installed: "0.2.3", env: {} })).toBeNull();
  });

  it("flags a mismatch with BOTH versions + a clear remediation, and refuses to create", () => {
    const msg = substrateMismatchMessage({ declared: "0.2.3", installed: "0.2.0", env: {} });
    expect(msg).not.toBeNull();
    expect(msg).toContain("Substrate mismatch");
    expect(msg).toContain("v0.2.3"); // declared
    expect(msg).toContain("v0.2.0"); // installed (the stale one)
    expect(msg).toContain("_npx"); // remediation: clear the npx cache
    expect(msg!.toLowerCase()).toContain("stale");
  });

  it("does NOT block when a side is undeterminable (unpinned dep / unresolved install)", () => {
    expect(substrateMismatchMessage({ declared: undefined, installed: "0.2.0", env: {} })).toBeNull();
    expect(substrateMismatchMessage({ declared: "0.2.3", installed: undefined, env: {} })).toBeNull();
  });

  it("honors an explicit LAKEBASE_SCM_UTILS_REF / _DIR override (dev/capture) even on mismatch", () => {
    expect(
      substrateMismatchMessage({ declared: "0.2.3", installed: "0.2.0", env: { LAKEBASE_SCM_UTILS_REF: "main" } }),
    ).toBeNull();
    expect(
      substrateMismatchMessage({ declared: "0.2.3", installed: "0.2.0", env: { LAKEBASE_SCM_UTILS_DIR: "/tmp/x" } }),
    ).toBeNull();
  });
});
