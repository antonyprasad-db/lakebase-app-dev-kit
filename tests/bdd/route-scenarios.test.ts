// Route-scenario suite: each entry in ROUTE_SCENARIOS is ONE route pathway out of a spec-author
// breakdown, run in ISOLATION against its own throwaway `.sftdd` workspace. It exercises the
// REAL stack , the manifest runner, the StepExecutor, a real escalation planted on disk, and the
// real disk probe deriving it back , so the ROUTE decision is genuine, not mocked. It is LEAN:
// no cloud project (the route pathways depend on `.sftdd` state, not Databricks/GitHub). The
// live-claude authoring path is covered separately by stockflow-demo-config-live.test.ts.
//
// The agents are deterministic fixtures (PO replay + a spec-author that writes a conformant
// feature-spec) so each scenario proves its ROUTE, not the model's prose.

import { describe, it, expect } from "vitest";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { runRouteScenario, routeMatches, type RouteScenarioHooks } from "../../consort/orchestrator/scenarios/route-scenario";
import { ROUTE_SCENARIOS } from "../../consort/orchestrator/scenarios/route-scenarios";
import { makeReplayPoMockAgent } from "../../consort/orchestrator/agents/replay-po-mock-agent";
import type { StepAgent } from "../../consort/orchestrator/agents/spec-author-breakdown-step-types";
import type { StepManifest } from "../../consort/orchestrator/manifest/step-manifest";
import type { ManifestRunnerDeps } from "../../consort/orchestrator/manifest/manifest-runner";
import type { DriveEffectsConfig } from "../../scripts/sftdd/orchestrator-effects";

/** Deterministic agents: PO replays the recorded intake; spec-author writes a conformant
 *  feature-spec + log. The route (not authoring) is under test, so these are fixtures. */
function makeAgentFor(intakeDir: string) {
  return (manifest: StepManifest): StepAgent => {
    if (manifest.role === "product-owner") {
      return makeReplayPoMockAgent({
        corpusRoot: intakeDir,
        seeds: [
          { outputId: "product-overview", from: "product-overview.md", to: "product-overview.md" },
          { outputId: "nfrs", from: "nfrs.md", to: "nfrs.md" },
          { outputId: "design-guideline", from: "design-brief.md", to: "design-brief.md" },
        ],
      });
    }
    return {
      async invoke(inv) {
        writeFileSync(
          join(inv.workspaceDir, "feature-spec.json"),
          JSON.stringify({ id: "F1-stock-visibility", name: "Stock Visibility", status: "draft", tdd_mode: "N>=2", stories: ["S1-stock-list"] }) + "\n",
        );
        writeFileSync(
          join(inv.workspaceDir, "agent-log.jsonl"),
          JSON.stringify({ timestamp: "2026-08-03T12:00:00Z", level: "info", role: "spec-author", event: "artifact.written", message: "wrote feature-spec.json" }) + "\n",
        );
      },
    };
  };
}

const hooks: RouteScenarioHooks = {
  runnerDeps(scenario, workspaceDir, cfg: DriveEffectsConfig): ManifestRunnerDeps {
    return { agentFor: makeAgentFor(scenario.intakeDir), workspaceDir, cfg };
  },
};

describe("route-scenario suite: each pathway isolated (produced / revise / escalate)", () => {
  for (const scenario of ROUTE_SCENARIOS) {
    it(`${scenario.id}: ${scenario.description}`, async () => {
      const result = await runRouteScenario(scenario, hooks);
      expect(
        routeMatches(result.actualRoute, scenario.expectedRoute),
        `expected route ${JSON.stringify(scenario.expectedRoute)} but got ${JSON.stringify(result.actualRoute)}`,
      ).toBe(true);
    });
  }
});
