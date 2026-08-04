// optimize-role CLI arg parsing: --role is required + must name a known chain; --base-model /
// --telemetry-dir are optional pass-throughs. The live run itself (runOptimizeRole) spawns real
// agents, so it is exercised by the gated live sweep, not here , this pins only the pure parser.

import { describe, it, expect } from "vitest";
import { parseArgs } from "../../scripts/sftdd/optimize-role.cli";

describe("optimize-role parseArgs", () => {
  it("parses --role + optional --base-model / --telemetry-dir", () => {
    const a = parseArgs(["--role", "test-strategist", "--base-model", "opus", "--telemetry-dir", "/tmp/x"]);
    expect(a).toEqual({ role: "test-strategist", baseModel: "opus", telemetryDir: "/tmp/x" });
  });

  it("defaults base-model + telemetry-dir to absent (the runner fills them)", () => {
    expect(parseArgs(["--role", "dba"])).toEqual({ role: "dba" });
  });

  it("throws loud when --role is absent", () => {
    expect(() => parseArgs([])).toThrow(/--role is required/i);
  });

  it("throws loud on an unknown role, listing the known ones", () => {
    expect(() => parseArgs(["--role", "no-such-role"])).toThrow(/unknown role.*test-strategist/i);
  });
});
