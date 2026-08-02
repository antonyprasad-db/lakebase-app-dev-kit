// optimize-candidates: the PURE candidate model for the per-handoff optimize
// harness. A Candidate is one point in the sweep space , a set of CONFIG
// overrides (Family 1: model / effort / session-scope / loop granularity, merged
// into a sftdd-config.json + a few env knobs) plus optional CONTENT/SCOPE
// variants (Family 2: an agent-.md overlay, a task/context suffix, a tool scope).
//
// This module has NO I/O. It only (1) enumerates the candidate list from a sweep
// spec and (2) deep-merges a candidate's config overrides onto a base config.
// Writing the merged config to disk, overlaying the agent .md, spawning the turn,
// gating + timing it, and keeping the winner are all the harness's job
// (optimize-harness.ts). Keeping generation pure makes the sweep space unit-
// testable without touching the filesystem or the cloud.

import type { SftddConfigFile, RoleSettingsFile, BuildTurn, EffortLevel } from "./sftdd-config.js";
import { type SpawnableAgentRole, RECOMMENDED_MODELS } from "./agent-models.js";

/** The identity candidate: no overrides, no content variant. Always first in a
 *  generated list so the harness measures the BASELINE turn under the same
 *  machinery as every candidate (an apples-to-apples "before"). */
export const BASELINE_CANDIDATE_ID = "baseline";

/** A Family-2 content/scope variant: what the agent SEES + CAN DO for one turn.
 *  All fields optional; the harness feeds each into the P2a seams (agent overlay
 *  copied into .claude/agents/, suffixes via DriveEffectsConfig hooks, tool scope
 *  via allowed/disallowedToolsForRole). */
export interface CandidateContent {
  /** Overlay a variant role definition for the forked turn (the big lever: the
   *  role's instructions + its skills:/tools: frontmatter + scan-scope wording). */
  agentOverlay?: { role: string; markdown: string };
  /** Appended to the role's task AFTER the terse suffix (a trailing directive). */
  taskSuffix?: string;
  /** Extra pre-extracted context appended BEFORE the terse suffix (inject-more/scan-less). */
  contextPackSuffix?: string;
  /** Restrict the turn's tool scope (--allowed-tools). */
  allowedTools?: string[];
  /** Deny specific tools for the turn (--disallowed-tools). */
  disallowedTools?: string[];
}

/** One point in the sweep space. */
export interface Candidate {
  /** Stable, unique, filesystem-safe id (also the experiments/ subdir name). */
  id: string;
  /** Config-file overrides deep-merged onto the base sftdd-config.json (Family 1). */
  configOverrides: DeepPartial<SftddConfigFile>;
  /** Extra env for the forked turn (e.g. CONTEXT_FREE_FRACTION), Family 1 knobs
   *  that ride on env rather than the config file. */
  env?: Record<string, string>;
  /** Family-2 content/scope variant, if any. */
  content?: CandidateContent;
}

/** The sweep spec: each dimension is optional; the generator crosses whichever
 *  are present with the baseline. Model / effort maps are keyed by build turn so a
 *  sweep can target, e.g., just the driver's GREEN turn. */
export interface SweepSpec {
  /** The role the model/effort maps target (defaults to "driver"). */
  role?: SpawnableAgentRole;
  /** Per-turn candidate models to try, e.g. { green: ["haiku", "sonnet"] }. */
  models?: Partial<Record<BuildTurn, string[]>>;
  /** Per-turn candidate efforts to try, e.g. { green: ["low", "medium"] }. */
  efforts?: Partial<Record<BuildTurn, EffortLevel[]>>;
  /** build.sessionScope values to try. */
  sessionScopes?: Array<"story" | "cycle">;
  /** CONTEXT_FREE_FRACTION values to try (ride on env). */
  contextFreeFractions?: number[];
  /** build.loopGranularity values to try. */
  loopGranularities?: Array<"story" | "ac" | "hybrid-a">;
  /** Family-2 content variants to try (each becomes its own candidate). */
  contentVariants?: CandidateContent[];
}

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

/** Generate the candidate list for a sweep. The baseline (identity) candidate is
 *  ALWAYS first; each present dimension contributes its own candidates crossed
 *  with the others where they compose naturally (model x effort), or standalone
 *  (session warmth, loop, content). Ids are stable + unique. */
export function generateCandidates(sweep: SweepSpec): Candidate[] {
  const role = sweep.role ?? "driver";
  const out: Candidate[] = [{ id: BASELINE_CANDIDATE_ID, configOverrides: {} }];

  // Family 1a: model x effort per turn (crossed). A model-only or effort-only
  // sweep degenerates to the single present axis (the absent axis contributes one
  // empty entry so the cross still runs once).
  const modelTurns = Object.keys(sweep.models ?? {}) as BuildTurn[];
  const effortTurns = Object.keys(sweep.efforts ?? {}) as BuildTurn[];
  if (modelTurns.length || effortTurns.length) {
    for (const turn of new Set([...modelTurns, ...effortTurns])) {
      const models = sweep.models?.[turn] ?? [undefined];
      const efforts = sweep.efforts?.[turn] ?? [undefined];
      for (const model of models) {
        for (const effort of efforts) {
          if (model === undefined && effort === undefined) continue;
          const roleSettings: RoleSettingsFile = {};
          if (model !== undefined) roleSettings.model = { [turn]: model } as Partial<Record<BuildTurn, string>>;
          if (effort !== undefined) roleSettings.effort = { [turn]: effort } as Partial<Record<BuildTurn, EffortLevel>>;
          const parts = [
            model !== undefined ? `m-${model}` : "",
            effort !== undefined ? `e-${effort}` : "",
          ].filter(Boolean);
          out.push({
            id: `${role}-${turn}-${parts.join("-")}`,
            configOverrides: { roles: { [role]: roleSettings } as DeepPartial<SftddConfigFile>["roles"] },
          });
        }
      }
    }
  }

  // Family 1b: session warmth = sessionScope x contextFreeFraction. The scope is a
  // config-file knob; the fraction rides on env (CONTEXT_FREE_FRACTION).
  const scopes = sweep.sessionScopes ?? [undefined];
  const fractions = sweep.contextFreeFractions ?? [undefined];
  if (sweep.sessionScopes?.length || sweep.contextFreeFractions?.length) {
    for (const scope of scopes) {
      for (const frac of fractions) {
        if (scope === undefined && frac === undefined) continue;
        const parts = [
          scope !== undefined ? `s-${scope}` : "",
          frac !== undefined ? `cff-${frac}` : "",
        ].filter(Boolean);
        out.push({
          id: `warmth-${parts.join("-")}`,
          configOverrides: scope !== undefined ? { build: { sessionScope: scope } } : {},
          ...(frac !== undefined ? { env: { CONTEXT_FREE_FRACTION: String(frac) } } : {}),
        });
      }
    }
  }

  // Family 1c: loop granularity.
  for (const loop of sweep.loopGranularities ?? []) {
    out.push({ id: `loop-${loop}`, configOverrides: { build: { loopGranularity: loop } } });
  }

  // Family 2: content/scope variants (each is its own candidate, carried verbatim).
  (sweep.contentVariants ?? []).forEach((content, i) => {
    out.push({ id: `content-${i + 1}`, configOverrides: {}, content });
  });

  return out;
}

/** A minimal handoff descriptor (role + optional story/buildMode), structurally
 *  compatible with optimize-harness's HandoffPlan without importing it (avoids a
 *  module cycle). */
export interface HandoffLike {
  role: string;
  story?: string;
  buildMode?: string;
}

/** A cheaper model than `model` for a downgrade candidate: opus->sonnet->haiku.
 *  Returns undefined when already at the floor (no downgrade to try). */
function cheaperModel(model: string): string | undefined {
  const tier: Record<string, string> = { opus: "sonnet", sonnet: "haiku" };
  return tier[model];
}

/** Per-role default candidates for a LANE sweep (the "model + effort + a
 *  prompt/scope variant" axis). DESIGN roles carry a SCALAR model/effort, so their
 *  candidates set `roles.<role>.model`/`.effort` as scalars; BUILD roles
 *  (navigator/driver) use the per-turn map keyed by the turn. The navigator REFLECT
 *  turn is a critic GATE (it flags defects, does not author an artifact), so it is
 *  never swept , baseline only. Baseline is always first. */
export function defaultLaneCandidates(handoff: HandoffLike): Candidate[] {
  const baseline: Candidate = { id: BASELINE_CANDIDATE_ID, configOverrides: {} };

  // The reflect critic is not an authoring turn , do not optimize it.
  if (handoff.role === "navigator" && handoff.buildMode === "reflect") return [baseline];

  const role = handoff.role;
  const isBuild = (role === "navigator" || role === "driver") && (handoff.buildMode === undefined || handoff.buildMode === "green" || handoff.buildMode === "red");
  const out: Candidate[] = [baseline];

  if (isBuild) {
    // Build turn: per-turn model map keyed by the turn (RED for navigator, GREEN
    // for driver). Sweep the recommended base vs a cheaper tier.
    const turn: BuildTurn = role === "driver" ? "green" : "red";
    const base = RECOMMENDED_MODELS[role as SpawnableAgentRole] ?? "sonnet";
    const cheaper = cheaperModel(base);
    if (cheaper) {
      out.push({
        id: `${role}-${turn}-m-${cheaper}`,
        configOverrides: { roles: { [role]: { model: { [turn]: cheaper } } } as DeepPartial<SftddConfigFile>["roles"] },
      });
    }
    out.push({
      id: `${role}-${turn}-e-low`,
      configOverrides: { roles: { [role]: { effort: { [turn]: "low" } } } as DeepPartial<SftddConfigFile>["roles"] },
    });
    out.push({
      id: `${role}-${turn}-scan-tight`,
      configOverrides: {},
      content: scanTightenContent(),
    });
    return out;
  }

  // Design role: SCALAR model/effort.
  const base = RECOMMENDED_MODELS[role as SpawnableAgentRole] ?? "opus";
  const cheaper = cheaperModel(base);
  if (cheaper) {
    out.push({
      id: `${role}-m-${cheaper}`,
      configOverrides: { roles: { [role]: { model: cheaper } } as DeepPartial<SftddConfigFile>["roles"] },
    });
  }
  out.push({
    id: `${role}-e-low`,
    configOverrides: { roles: { [role]: { effort: "low" } } as DeepPartial<SftddConfigFile>["roles"] },
  });
  out.push({
    id: `${role}-scan-tight`,
    configOverrides: {},
    content: scanTightenContent(),
  });
  return out;
}

/** The HARD scan-tightening content variant: the inject-vs-scan lever, ENFORCED.
 *  A soft directive alone only ASKS the agent not to scan; a losing candidate then
 *  wanders the tree anyway and shows no speedup (waste). This instead (1) DENIES the
 *  tree-scanning tools (Grep/Glob) so broad scanning is impossible, and (2) keeps the
 *  directive so the agent understands to lean on the context pack + named paths it
 *  was already handed. If it is faster + still gate-passing, the speedup is real +
 *  enforceable on persist (a narrower tools: frontmatter). Read/Bash stay allowed, so
 *  it can still read the exact files named in its task. */
function scanTightenContent(): CandidateContent {
  return {
    taskSuffix: SCAN_TIGHTEN_SUFFIX,
    disallowedTools: ["Grep", "Glob"],
  };
}
const SCAN_TIGHTEN_SUFFIX =
  " Rely on the context pack + the exact artifact paths named in your task;" +
  " Grep/Glob are DISABLED for this turn, so do not try to scan the wider tree ," +
  " read the named files directly with Read.";

/** Deep-merge a candidate's config overrides onto a base config, returning a
 *  FRESH object (the base is never mutated). Arrays + scalars replace; nested
 *  objects merge key-by-key, so a per-turn model override keeps the role's other
 *  turns and the config's other roles/blocks. */
export function applyCandidateConfig(base: SftddConfigFile, candidate: Candidate): SftddConfigFile {
  return deepMerge(base, candidate.configOverrides) as SftddConfigFile;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function deepMerge(base: unknown, over: unknown): unknown {
  if (!isPlainObject(base) || !isPlainObject(over)) {
    // Non-object override replaces; a non-object base with an object override
    // takes the override (the override wins for mismatched shapes).
    return over === undefined ? clone(base) : clone(over);
  }
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(base)) out[k] = clone(base[k]);
  for (const k of Object.keys(over)) {
    out[k] = k in base ? deepMerge(base[k], over[k]) : clone(over[k]);
  }
  return out;
}

function clone<T>(v: T): T {
  return isPlainObject(v) || Array.isArray(v) ? (JSON.parse(JSON.stringify(v)) as T) : v;
}
