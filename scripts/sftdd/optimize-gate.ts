// optimize-gate: the DESIGN-handoff gate evaluator for the optimize harness. It
// reuses the kit's own gates VERBATIM so a candidate can never pass a weaker
// check than the baseline:
//   1. the role SELF-CHECK (response-formatter formatRoleResponse), and
//   2. the design GATE (gate-conformance-guard resolveArtifactInputs).
// Both must be clean for a trial to count as gate-passing. Pure (reads the
// .sftdd), hermetic.
//
// Build-turn (navigator/driver) gating is NOT here: it is the honest-GREEN cycle
// outcome (greenOpenCycle's real alembic+pytest) + a conformant review verdict,
// which the trial runner produces directly. gateForDesignHandoff returns null for
// build turns so the harness knows to use the cycle result instead.

import { formatRoleResponse } from "./response-formatter.js";
import { resolveArtifactInputs, featureDir } from "./gate-conformance-guard.js";
import type { GateName } from "./gates.js";

/** A handoff descriptor sufficient to resolve its gate. */
export interface DesignHandoff {
  role: string;
  story?: string;
  buildMode?: string;
}

/** The gate mapping for a design role: which self-check role to run + which
 *  design gate to resolve. */
export interface DesignGateMapping {
  selfCheckRole: string;
  gate: GateName;
}

/** Map a design handoff to its (self-check role, gate). Returns null for build
 *  turns (navigator/driver with a buildMode), whose gate is the cycle result. */
export function gateForDesignHandoff(handoff: DesignHandoff): DesignGateMapping | null {
  // A navigator/driver turn carrying a build mode is a BUILD turn, not a design
  // gate. (The navigator's design-lane reflect is handled as its own turn.)
  if ((handoff.role === "driver" || handoff.role === "navigator") && handoff.buildMode) return null;

  switch (handoff.role) {
    case "spec-author":
      return { selfCheckRole: "spec-author", gate: "spec" };
    case "architect-reviewer":
      // The architect's per-AC notes feed the spec gate's architecture
      // conformance; the architect has its own self-check.
      return { selfCheckRole: "architect-reviewer", gate: "spec" };
    case "test-strategist":
      return { selfCheckRole: "test-strategist", gate: "test_list" };
    case "dba":
      // The DBA's realizes_invariants feed the spec gate; self-check is the dba's.
      return { selfCheckRole: "dba", gate: "spec" };
    case "ux-designer":
      // The ux-designer's design-guide has a self-check but no standalone gate in
      // GATE_NAMES; the self-check alone is its bar.
      return { selfCheckRole: "ux-designer", gate: "spec" };
    default:
      return null;
  }
}

export interface GateOutcome {
  passed: boolean;
  reason?: string;
}

/** Evaluate a design handoff's artifacts against the SAME two checks the drive
 *  runs: the role self-check, then the design gate. Passes only when both are
 *  clean. */
export function evaluateDesignGate(args: {
  sftddDir: string;
  featureId: string;
  handoff: DesignHandoff;
}): GateOutcome {
  const { sftddDir, featureId, handoff } = args;
  const mapping = gateForDesignHandoff(handoff);
  if (!mapping) {
    return { passed: false, reason: `not a design handoff (role=${handoff.role}, buildMode=${handoff.buildMode ?? "none"})` };
  }

  // 1. Role self-check (the same precheck the drive's verify-artifact step runs).
  const self = formatRoleResponse({ role: mapping.selfCheckRole, sftddDir, featureId, story: handoff.story });
  if (!self.ok) {
    const first = self.violations[0];
    return { passed: false, reason: `self-check: ${first.artifact}: ${first.problem}` };
  }

  // 2. Design gate (the same conformance the Human Proxy gate approval resolves).
  const fdir = featureDir(sftddDir, featureId);
  const resolved = resolveArtifactInputs(mapping.gate, fdir, undefined, sftddDir, featureId);
  if ("reason" in resolved) {
    return { passed: false, reason: `gate ${mapping.gate}: ${resolved.reason}` };
  }

  return { passed: true };
}
