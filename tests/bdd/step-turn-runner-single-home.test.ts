// Guard: the orchestrator's directories mirror the control hierarchy , a WORKFLOW is run by an
// ORCHESTRATOR managing TURNS, each TURN executes a STEP, tuned by per-project SETTINGS. This is the
// anti-recurrence gate for the step/turn/runner/settings reorg: it fails if a layer's definition
// re-scatters outside its home, OR if the killed manifest-step / step-manifest homophone (or the old
// ambiguous dir names) comes back.
//
//   steps/    defines a step (contract + the one impl + run I/O + manifest data + JSON)
//   turn/     executes ONE step (the Template Method + monitor + report)
//   runner/   runs a workflow's turns + loads its run-config
//   settings/ the per-project settings resolver

import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";

const SELF = "tests/bdd/step-turn-runner-single-home.test.ts";

/** git grep -lF for a fixed string across the tracked tree; [] on zero matches. */
function grepFiles(pattern: string): string[] {
  try {
    const out = execFileSync("git", ["grep", "-lF", pattern], { encoding: "utf-8", cwd: process.cwd() });
    return out.split("\n").map((l) => l.trim()).filter(Boolean);
  } catch (e) {
    if ((e as { status?: number }).status === 1) return [];
    throw e;
  }
}

/** Tracked paths under consort/orchestrator/ (scoped so the output stays small , the whole tree,
 *  incl. committed dist/ + corpus, overflows execFileSync's buffer, and these checks only concern
 *  the orchestrator source dirs anyway). */
function orchestratorPaths(): string[] {
  return execFileSync("git", ["ls-files", "consort/orchestrator/"], { encoding: "utf-8", cwd: process.cwd() })
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

// Each layer's home + the definition tokens that must live ONLY under it.
const LAYERS: Array<{ home: string; tokens: Record<string, string> }> = [
  {
    home: "consort/orchestrator/steps/",
    tokens: {
      "step impl": "export class Step ",
      "step contract": "export interface StepContract",
      "shipped manifests": "export const SHIPPED_MANIFESTS",
      "manifest shape": "export interface StepManifest ",
      "run I/O contract": "export interface ProvidedStepRun",
    },
  },
  {
    home: "consort/orchestrator/turn/",
    tokens: {
      "executor deps": "export interface StepExecutorDeps",
      "turn monitor": "export interface TurnMonitor",
    },
  },
  {
    home: "consort/orchestrator/runner/",
    tokens: {
      "turn loop": "export async function runManifestChain",
      "run-config loader": "export function loadRunConfig",
      "orchestration bracket": "export async function runOrchestration",
    },
  },
  {
    home: "consort/orchestrator/settings/",
    tokens: { "settings resolver": "export function resolveSftddSettings" },
  },
];

describe("orchestrator layers: step / turn / runner / settings each live in ONE home", () => {
  for (const { home, tokens } of LAYERS) {
    for (const [name, token] of Object.entries(tokens)) {
      it(`${name} is defined only under ${home}`, () => {
        const offenders = grepFiles(token).filter((f) => !f.startsWith(home) && !f.startsWith("dist/") && f !== SELF);
        expect(
          offenders,
          `"${token}" is defined outside ${home} , move it back:\n  ${offenders.join("\n  ")}`,
        ).toEqual([]);
      });
    }
  }

  it("the manifest-step / step-manifest homophone is dead (no such file under orchestrator/)", () => {
    const offenders = orchestratorPaths().filter(
      (p) => p.endsWith("/manifest-step.ts") || p.endsWith("/step-manifest.ts"),
    );
    expect(offenders, `the manifest-step/step-manifest homophone returned:\n  ${offenders.join("\n  ")}`).toEqual([]);
  });

  it("the old ambiguous orchestrator dirs are gone (execution/ manifest/ contract/ config/)", () => {
    const OLD = ["execution/", "manifest/", "contract/", "config/"];
    const offenders = orchestratorPaths().filter((p) =>
      OLD.some((d) => p.startsWith(`consort/orchestrator/${d}`)),
    );
    expect(
      offenders,
      `a file resurfaced under an old orchestrator dir (execution/manifest/contract/config):\n  ${offenders.join("\n  ")}`,
    ).toEqual([]);
  });
});
