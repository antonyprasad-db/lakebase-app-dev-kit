// role-levers: candidate generation for the per-role chain sweep. A candidate is a PATCH on the
// live role's AgentLevers , what the sweep varies to try to beat the role's baseline turn. The
// axes mirror the drive-bound optimize-candidates lane set (model tiers, effort rungs, scan-tight),
// but the target is the chain's live-role agent config (model/effort/tool scope), not a
// sftdd-config.json , because the chain's ClaudeStepAgent reads its levers directly from the
// manifest's agent.config. Pure: enumerate only, no I/O.
//
// TRY ALL POSSIBILITIES from the identical pre-turn state (the replay-seeded workspace):
//   (1) every OTHER model tier , cheaper AND more capable (a bigger model can win wall-clock via
//       fewer round-trips; a cheaper one wins on cost if it still passes the gate),
//   (2) each cheaper effort rung (low, medium) at the base model,
//   (3) the model x low-effort CROSS for every other model (change the model AND think less , often
//       the biggest single win, invisible when either lever is tried alone),
//   (4) a scan-tight variant that DENIES Grep/Glob (the inject-vs-scan lever, enforced).
// The gate (conformance) is the same structural bar for every candidate, so wall-clock/cost alone
// decides among the gate-passers.

/** The candidate's lever patch on the live role's AgentLevers. All optional; absent = the role's
 *  default (baseline). tool-scope patches restrict what the turn may call. */
export interface RoleLeverPatch {
  model?: string;
  effort?: string;
  allowedTools?: string[];
  disallowedTools?: string[];
}

/** One point in the sweep space: a stable id + the lever patch it applies. */
export interface RoleCandidate {
  /** Stable, filesystem-safe id (also the telemetry record's chain suffix). */
  id: string;
  /** The lever patch merged onto the live manifest's agent.config for this candidate. */
  levers: RoleLeverPatch;
}

/** The identity candidate: the role's default levers, no patch. Always first so the baseline turn
 *  is measured under the same machinery as every candidate (apples-to-apples "before"). */
export const BASELINE_ID = "baseline";

/** The model tiers to try against the base , EVERY OTHER tier, cheaper AND more capable. Ordered
 *  cheapest->most-capable for stable, readable ids. */
const MODEL_TIERS = ["haiku", "sonnet", "opus"] as const;
function otherModels(base: string): string[] {
  return MODEL_TIERS.filter((m) => m !== base);
}

/** The cheaper effort rungs worth trying below the model default: low (the floor) + medium (a
 *  safety rung, in case low under-thinks + degrades the artifact but medium is still faster). */
const CHEAPER_EFFORTS = ["low", "medium"] as const;

/** The scan-tighten patch: deny the tree-scanning tools so broad scanning is impossible; the turn
 *  must lean on the inputs it was handed (the chain already provides them in the prompt). */
function scanTightPatch(): RoleLeverPatch {
  return { disallowedTools: ["Grep", "Glob"] };
}

/**
 * Generate the candidate list for a role whose baseline runs on `baseModel`. Baseline first, then
 * the four families above. Ids are stable + unique. The caller (role-sweep) applies each patch to
 * the live manifest's agent.config + runs the chain once per candidate.
 */
export function roleCandidates(baseModel: string): RoleCandidate[] {
  const others = otherModels(baseModel);
  const out: RoleCandidate[] = [{ id: BASELINE_ID, levers: {} }];

  // (1) every other model tier
  for (const m of others) out.push({ id: `m-${m}`, levers: { model: m } });
  // (2) each cheaper effort rung at the base model
  for (const e of CHEAPER_EFFORTS) out.push({ id: `e-${e}`, levers: { effort: e } });
  // (3) model x low-effort cross for every other model
  for (const m of others) out.push({ id: `m-${m}-e-low`, levers: { model: m, effort: "low" } });
  // (4) scan-tight (deny Grep/Glob)
  out.push({ id: "scan-tight", levers: scanTightPatch() });

  return out;
}
