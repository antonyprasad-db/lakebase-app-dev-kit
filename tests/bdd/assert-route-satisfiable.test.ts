// The PRE-DISPATCH route-contract check: a route to a turn whose REQUIRED process event was not
// produced fails LOUD naming the ROUTE (RouteContractError), not later with a bare "missing input".
// These pin: (a) a required event missing at its scope throws + names route AND event AND path;
// (b) the event present passes; (c) a turn requiring no event is a no-op; (d) scope resolves per the
// event (green-failure at CYCLE scope needs the action's ac in the path). `exists` is injected so the
// check is pure , no disk.

import { describe, it, expect } from "vitest";
import {
  assertRouteSatisfiable,
  RouteContractError,
} from "../../consort/orchestrator/steps/assert-route-satisfiable.js";
import type { WorkflowAction } from "../../consort/orchestrator/workflow/workflow-vocabulary.js";

const ctx = { consortDir: "/repo/.consort", featureId: "F1-stock" };
const assess: WorkflowAction = {
  kind: "invoke-role",
  role: "navigator",
  story: "S1-file-stock",
  buildMode: "assess",
  ac: "AC1-record-filed",
} as WorkflowAction;

// Step-shaped face: only requiresEvents matters to the check.
const requires = (...events: string[]) => ({ requiresEvents: () => events as never });

describe("assertRouteSatisfiable: route→event→consumer, loud + route-named", () => {
  it("THROWS RouteContractError when a required event's artifact is absent", () => {
    let err: unknown;
    try {
      assertRouteSatisfiable(assess, requires("green-failure"), ctx, () => false);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(RouteContractError);
    const rce = err as RouteContractError;
    expect(rce.event).toBe("green-failure");
    // green-failure is CYCLE-scoped: the resolved path includes the action's story AND ac dirs.
    expect(rce.expectedPath).toContain("S1-file-stock");
    expect(rce.expectedPath).toContain("AC1-record-filed");
    expect(rce.expectedPath).toContain("green-failure.json");
    // The message blames the ROUTE, not a bare "missing input".
    expect(rce.message).toMatch(/route selected turn/);
    expect(rce.message).toContain("green-failure");
  });

  it("PASSES (no throw) when the required event artifact exists", () => {
    expect(() =>
      assertRouteSatisfiable(assess, requires("green-failure"), ctx, () => true),
    ).not.toThrow();
  });

  it("is a NO-OP for a turn that requires no event (plain RED/GREEN)", () => {
    const plainGreen = { kind: "invoke-role", role: "driver", story: "S1-file-stock" } as WorkflowAction;
    // exists=false would throw IF anything were required; requiring nothing means never consulted.
    expect(() => assertRouteSatisfiable(plainGreen, requires(), ctx, () => false)).not.toThrow();
  });

  it("checks EVERY required event and throws on the FIRST missing one", () => {
    // Only the second exists → the first (green-failure) is the reported miss.
    const exists = (p: string) => p.includes("regression-assessment.json");
    let err: unknown;
    try {
      assertRouteSatisfiable(assess, requires("green-failure", "regression-assessment"), ctx, exists);
    } catch (e) {
      err = e;
    }
    expect((err as RouteContractError).event).toBe("green-failure");
  });
});
