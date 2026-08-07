// optimize-role CLI arg parsing + chain-set expansion: --chains is a SET keyword (design or
// navigator) or a comma list of handles; --role is the back-compat single-chain alias;
// --concurrency caps in-flight candidates. The live run itself (runOptimizeRole) spawns real
// agents, so it is exercised by the gated live sweep, not here; this pins only the parser + expander.

import { describe, it, expect } from "vitest";
import { parseArgs, expandChains } from "../optimization/optimize-role.cli";
import { ROLE_CHAINS } from "../../consort/optimize/role-chains";
import { BUILD_ROLE_CHAINS } from "../../consort/optimize/build-role-chains";

describe("optimize-role expandChains", () => {
  it("expands the 'design' set to EVERY design role chain", () => {
    const handles = expandChains("design");
    expect(handles).toEqual(Object.keys(ROLE_CHAINS));
    expect(handles).toContain("spec-author-story");
    expect(handles).toContain("test-strategist");
    expect(handles).toContain("ux-designer");
  });

  it("expands the 'navigator' set to EVERY navigator build chain", () => {
    const handles = expandChains("navigator");
    expect(handles).toEqual(Object.keys(BUILD_ROLE_CHAINS));
    expect(handles).toContain("navigator-red");
    expect(handles).toContain("navigator-assess");
    expect(handles).toContain("navigator-review");
    expect(handles).toContain("navigator-reflect");
  });

  it("expands a comma list of handles, de-duping while preserving order", () => {
    expect(expandChains("dba,architect-reviewer,dba")).toEqual(["dba", "architect-reviewer"]);
  });

  it("throws loud on an unknown handle, listing sets + known handles", () => {
    expect(() => expandChains("no-such-chain")).toThrow(/unknown chain.*design/i);
  });

  it("throws when the spec expands to nothing", () => {
    expect(() => expandChains(",")).toThrow(/expanded to nothing/i);
  });
});

describe("optimize-role parseArgs", () => {
  it("parses --chains <set> + optional --base-model / --telemetry-dir / --concurrency", () => {
    const a = parseArgs(["--chains", "design", "--base-model", "opus", "--telemetry-dir", "/tmp/x", "--concurrency", "4"]);
    expect(a.chains).toEqual(Object.keys(ROLE_CHAINS));
    expect(a.baseModel).toBe("opus");
    expect(a.telemetryDir).toBe("/tmp/x");
    expect(a.concurrency).toBe(4);
  });

  it("parses --chains as a comma list of handles", () => {
    expect(parseArgs(["--chains", "dba,test-strategist"]).chains).toEqual(["dba", "test-strategist"]);
  });

  it("back-compat: --role <handle> resolves to a single-chain list", () => {
    expect(parseArgs(["--role", "dba"]).chains).toEqual(["dba"]);
  });

  it("defaults base-model + telemetry-dir + concurrency to absent (the runner fills them)", () => {
    const a = parseArgs(["--chains", "dba"]);
    expect(a.baseModel).toBeUndefined();
    expect(a.telemetryDir).toBeUndefined();
    expect(a.concurrency).toBeUndefined();
  });

  it("clamps --concurrency to >= 1", () => {
    expect(parseArgs(["--chains", "dba", "--concurrency", "0"]).concurrency).toBe(1);
    expect(parseArgs(["--chains", "dba", "--concurrency", "-3"]).concurrency).toBe(1);
  });

  it("throws loud when neither --chains nor --role is given", () => {
    expect(() => parseArgs([])).toThrow(/--chains .* is required|--role/i);
  });

  it("throws loud on an unknown chain, listing the known ones", () => {
    expect(() => parseArgs(["--chains", "no-such-role"])).toThrow(/unknown chain.*test-strategist/i);
  });
});
