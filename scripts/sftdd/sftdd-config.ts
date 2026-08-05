// Project settings live in one file: `.lakebase/sftdd-config.json` (per-role model/
// effort matrix + build/plan/project knobs). Every project setting resolves
// sftdd-config.json -> code default, with no env or flag override at read time.
// Writers: create-project (create-time) and the drive's write-through override
// flags. The resolved result is what the driver runs with and what run-config.json
// snapshots. Run-mode knobs (record/replay/headless/debug) are not project settings;
// they stay explicit env inputs, read via sftddEnv.
//
// Model knobs mirror what `claude -p` exposes: model, effort
// (low|medium|high|xhigh|max|default), fallbackModel, maxBudgetUsd.

import { existsSync, readFileSync, mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import type { AgentRole } from "./agent-log.js";
import {
  ALL_AGENT_ROLES,
  RECOMMENDED_MODELS,
  readAgentConfig,
  type SpawnableAgentRole,
} from "./agent-models.js";
// Auto-applied optimization winners, deep-merged onto the base default (see
// defaultSftddConfig). Static import so tsup inlines it into dist at build time; the
// champion walk's auto-apply writes this file as DATA, never a TS rewrite.
import OPTIMIZED_DEFAULTS from "./optimized-defaults.json";

/** Project-relative path of the unified config (canonical name post-SFTDD rename). */
export const SFTDD_CONFIG_REL = join(".lakebase", "sftdd-config.json");
/** Legacy pre-rename name, still READ (dual-read) so existing scaffolded projects
 *  keep working until they migrate. New writes use SFTDD_CONFIG_REL. */
export const LEGACY_TDD_CONFIG_REL = join(".lakebase", "tdd-config.json");
/** @deprecated use SFTDD_CONFIG_REL. Kept as an alias for callers not yet updated. */
export const TDD_CONFIG_REL = SFTDD_CONFIG_REL;

/** The BUILD turns whose effort/model can differ within the navigator/driver loop.
 *  Each is a DISTINCT kind of work, so each can pick its own model/effort ("apply to
 *  the turn, not the role"):
 *   navigator (judgment): red (author tests), review (critique code), assess (scope
 *     contamination-fragile tests before a refactor/deploy).
 *   driver (code): green (implement), refactor (restructure code), repair (fix a
 *     regression a prior story's build broke).
 *  The specialized drive buildModes collapse onto these base families , they are the
 *  same KIND of work, differing only in what triggered them:
 *   refactor-deploy / refactor-superseded -> refactor;  assess-deploy / assess-refactor
 *   -> assess;  green-superseded -> green.
 *  (reflect is the design-lane critic, keyed as its own DesignStep-adjacent case in
 *  turnKeyForAction, never a build turn here.) */
export type BuildTurn = "red" | "green" | "review" | "refactor" | "assess" | "repair";

/** The DESIGN/planning steps a role can be invoked for. A role runs different
 *  TASKS across these steps (spec-author BREAKDOWN vs per-story AC authoring;
 *  architect ESTIMATE vs per-story ARCHITECT notes), so a lever that wins on one
 *  step need not win on another , effort/model are keyed on the step, not the role. */
export type DesignStep =
  | "breakdown" // spec-author: enumerate the feature's stories
  | "propose" // spec-author: project feature-proposals (planning)
  | "acs" // spec-author: author a story's acceptance criteria
  | "estimate" // architect-reviewer: planning estimates
  | "architect" // architect-reviewer: per-story architecture notes
  | "dba" // dba: per-story physical schema
  | "test-list" // test-strategist: per-story test list
  | "ux"; // ux-designer: the project style guide (once)

/** The full per-invocation key effort/model can be applied on: a BUILD turn OR a
 *  DESIGN step. This is the "apply to the step, not the role" axis , the champion
 *  walk sweeps per invocation, so a winner is persisted keyed on the exact step it
 *  was measured on. A single-turn role with no key falls back to its scalar. */
export type TurnKey = BuildTurn | DesignStep;

/** `--effort` levels `claude -p` accepts, plus "default" (omit the flag). */
export type EffortLevel = "default" | "low" | "medium" | "high" | "xhigh" | "max";

/** Per-role settings as written on disk. `model` and `effort` are each either one
 *  value for the whole role, or a per-turn map (only navigator/driver have multiple
 *  turns). A per-turn `model` map is how the Driver's mechanical GREEN/REFACTOR runs
 *  on a cheaper/faster model than its RED (test authoring), the model-tiering lever. */
export interface RoleSettingsFile {
  model?: string | Partial<Record<TurnKey, string>>;
  fallbackModel?: string;
  maxBudgetUsd?: number;
  effort?: EffortLevel | Partial<Record<TurnKey, EffortLevel>>;
}

export interface SftddConfigFile {
  version: 1;
  roles?: Partial<Record<SpawnableAgentRole, RoleSettingsFile>>;
  build?: {
    loopGranularity?: "story" | "ac" | "hybrid-a";
    batchCap?: number;
    sessionScope?: "story" | "cycle";
  };
  plan?: { sizing?: boolean };
  project?: {
    uiTrack?: boolean;
    gates?: "interactive" | "proxy";
    deployTarget?: string;
    clientFramework?: "react" | "none";
  };
}

/** The fully-resolved settings the driver runs with (file -> code default). */
export interface ResolvedSettings {
  /** A role's BASE model (the scalar it runs with when no per-turn override
   *  applies). Callers that know the turn should prefer `modelFor`. */
  models: Record<string, string>;
  fallbackModels: Record<string, string | undefined>;
  budgets: Record<string, number | undefined>;
  /** Resolve the model to spawn a role's turn/step with: a per-key `model` map entry
   *  (e.g. driver GREEN on haiku, or spec-author BREAKDOWN on haiku) when present,
   *  else the role's base model. The model-tiering lever, applied per invocation
   *  step, not per role. */
  modelFor(role: string, turn?: TurnKey): string;
  /** Resolve a role's effort for a turn/step ("default" => omit --effort). */
  effortFor(role: string, turn?: TurnKey): EffortLevel;
  build: { loopGranularity: "story" | "ac" | "hybrid-a"; batchCap?: number; sessionScope: "story" | "cycle" };
  plan: { sizing: boolean };
  project: {
    uiTrack: boolean;
    gates: "interactive" | "proxy";
    deployTarget: string;
    clientFramework: "react" | "none";
  };
}

/** Read `.lakebase/sftdd-config.json` (canonical), falling back to the legacy
 *  `.lakebase/tdd-config.json` for projects scaffolded before the rename.
 *  Undefined when neither exists / both unparseable. */
export function loadSftddConfig(projectDir: string): SftddConfigFile | undefined {
  for (const rel of [SFTDD_CONFIG_REL, LEGACY_TDD_CONFIG_REL]) {
    const f = join(projectDir, rel);
    if (!existsSync(f)) continue;
    try {
      return JSON.parse(readFileSync(f, "utf8")) as SftddConfigFile;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/** Code default effort, keyed on the invocation STEP (not the whole role):
 *   - navigator REVIEW runs fast (low), the P6 default.
 *   - spec-author BREAKDOWN runs low , the per-handoff sweep (stockflow-optimize) measured
 *     it ~44% faster on haiku+low (~17% on low alone) with the same self-check + spec gate.
 *   - test-strategist TEST-LIST runs low , the #556 quality-gated per-role sweep measured
 *     effort=low on sonnet -89% wall (71.5s vs 679.9s baseline) with quality 0.90, ABOVE the
 *     sonnet baseline's 0.85 (16 vs 15 test items). This is the winner replacing the baseline
 *     for this step; model stays the recommended default (cheaper models scored thinner).
 *  Each winner is keyed to its EXACT step only ("apply to the step, not the role"): a role's
 *  other steps (e.g. spec-author AC-authoring) keep the model default until their own sweep.
 *  Everything else uses the model default. Preserves P6 behavior when no config/env overrides. */
function defaultEffort(role: string, turn?: TurnKey): EffortLevel {
  if (role === "navigator" && turn === "review") return "low";
  if (role === "spec-author" && turn === "breakdown") return "low";
  if (role === "test-strategist" && turn === "test-list") return "low";
  return "default";
}

interface ResolveInputs {
  projectDir: string;
}

/**
 * Resolve the run settings: file -> code default, per setting. The file is the
 * SINGLE source of truth for project settings; there is no env override. Legacy
 * `.lakebase/agent-config.json` (models only) is honored as a fallback BELOW the
 * new file but ABOVE the built-in recommended, so existing projects keep their
 * model choices until they adopt sftdd-config.json.
 */
export function resolveSftddSettings(inputs: ResolveInputs): ResolvedSettings {
  const file = loadSftddConfig(inputs.projectDir);
  const legacy = readAgentConfig(inputs.projectDir); // models only

  const models: Record<string, string> = {};
  const fallbackModels: Record<string, string | undefined> = {};
  const budgets: Record<string, number | undefined> = {};
  for (const role of ALL_AGENT_ROLES) {
    const rc = file?.roles?.[role];
    const legacyEntry = legacy?.roles?.[role];
    // A per-turn `model` map has no single scalar; the base falls through to
    // legacy -> recommended -> inherit. Only a string `model` sets the base.
    const scalarModel = typeof rc?.model === "string" ? rc.model : undefined;
    models[role] =
      scalarModel ?? legacyEntry?.override ?? legacyEntry?.recommended ?? RECOMMENDED_MODELS[role] ?? "inherit";
    fallbackModels[role] = rc?.fallbackModel;
    budgets[role] = typeof rc?.maxBudgetUsd === "number" ? rc.maxBudgetUsd : undefined;
  }

  const modelFor = (role: string, turn?: TurnKey): string => {
    const m = file?.roles?.[role as SpawnableAgentRole]?.model;
    // A per-key map wins for the turn/step it names (driver GREEN on haiku,
    // spec-author BREAKDOWN on haiku); a scalar (or an absent key in the map) falls
    // to the role's base model.
    if (m && typeof m !== "string" && turn && m[turn]) return m[turn] as string;
    return models[role] ?? "inherit";
  };

  const effortFor = (role: string, turn?: TurnKey): EffortLevel => {
    // The file is the single source: a scalar applies to all steps; a map is per-step.
    const rc = file?.roles?.[role as SpawnableAgentRole];
    const e = rc?.effort;
    if (typeof e === "string") return e;
    if (e && turn && e[turn]) return e[turn] as EffortLevel;
    return defaultEffort(role, turn);
  };

  const build = {
    loopGranularity: (file?.build?.loopGranularity ?? "story") as "story" | "ac" | "hybrid-a",
    batchCap: file?.build?.batchCap,
    sessionScope: (file?.build?.sessionScope ?? "story") as "story" | "cycle",
  };

  const project = {
    uiTrack: file?.project?.uiTrack ?? false,
    // HITL-first: the declared project policy defaults to interactive (a human
    // approves each gate). Headless (proxy) is a deliberate opt-in, set in the
    // file or as a RUN-SCOPED --gates override (never persisted by a flag).
    gates: (file?.project?.gates ?? "interactive") as "interactive" | "proxy",
    deployTarget: file?.project?.deployTarget ?? "local",
    clientFramework: (file?.project?.clientFramework ?? "none") as "react" | "none",
  };

  const plan = { sizing: file?.plan?.sizing ?? true };

  return { models, modelFor, fallbackModels, budgets, effortFor, build, plan, project };
}

/** A default config seeded from the recommended models (for scaffold / `--init`),
 *  with the navigator REVIEW effort pinned low (the P6 default made explicit). */
export function defaultSftddConfig(): SftddConfigFile {
  const roles = {} as Record<SpawnableAgentRole, RoleSettingsFile>;
  for (const role of ALL_AGENT_ROLES) {
    roles[role] =
      role === "navigator"
        ? { model: RECOMMENDED_MODELS[role], effort: { review: "low" } }
        : role === "driver"
          ? // Model tiering: RED (test authoring) + GREEN (implementation) keep the
            // recommended model; only the mechanical REFACTOR turn drops to a fast
            // model. GREEN was on haiku, but the recorded worst GREEN turn thrashed
            // 93 tool round-trips (haiku's trial-and-error), so wall-clock, not token
            // cost, dominated. Sonnet finishes GREEN in far fewer round-trips, faster
            // even at a higher per-token price. Overridable per project by editing
            // sftdd-config.json (a project can flatten to a scalar `model`).
            { model: { red: RECOMMENDED_MODELS[role], green: RECOMMENDED_MODELS[role], refactor: "haiku" } }
          : // Every other role's base is just its recommended model. Optimization
            // winners (e.g. spec-author breakdown -> haiku+low) are NOT hardcoded here;
            // they live in optimized-defaults.json and are deep-merged below, so the
            // champion walk's auto-apply is the single writer of applied winners.
            { model: RECOMMENDED_MODELS[role] };
  }
  const base: SftddConfigFile = {
    version: 1,
    roles,
    build: { loopGranularity: "story", batchCap: 3, sessionScope: "story" },
    plan: { sizing: true },
    project: { uiTrack: false, gates: "interactive", deployTarget: "local", clientFramework: "none" },
  };
  // Deep-merge the auto-applied optimization winners (optimized-defaults.json) on top.
  // The champion walk's auto-apply writes DATA into that file (never a TS rewrite, so
  // the "one source of truth / no source regex" rule holds); it is inlined into dist at
  // build time. A winner keyed per-turn/step (e.g. spec-author.breakdown -> haiku) is
  // merged element-wise so it augments the base rather than replacing a whole map.
  return mergeOptimizedDefaults(base, OPTIMIZED_DEFAULTS as Partial<SftddConfigFile>);
}

/** Element-wise deep-merge of the optimized-defaults overlay onto the base config.
 *  Plain objects merge recursively (so a per-turn `model`/`effort` map is augmented,
 *  not clobbered); scalars + arrays from the overlay win. Ignores the `_comment` key. */
function mergeOptimizedDefaults<T>(base: T, overlay: unknown): T {
  if (overlay === null || typeof overlay !== "object" || Array.isArray(overlay)) {
    return (overlay === undefined ? base : (overlay as T));
  }
  const out: Record<string, unknown> = Array.isArray(base)
    ? [...(base as unknown[])] as unknown as Record<string, unknown>
    : { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(overlay as Record<string, unknown>)) {
    if (k === "_comment") continue;
    const b = out[k];
    out[k] = b && typeof b === "object" && !Array.isArray(b) && v && typeof v === "object" && !Array.isArray(v)
      ? mergeOptimizedDefaults(b, v)
      : v;
  }
  return out as T;
}

/** Write a sftdd-config.json (scaffold/init). Does not overwrite unless force. */
export function writeSftddConfig(projectDir: string, config: SftddConfigFile, opts?: { force?: boolean }): boolean {
  const f = join(projectDir, TDD_CONFIG_REL);
  if (existsSync(f) && !opts?.force) return false;
  mkdirSync(dirname(f), { recursive: true });
  writeFileSync(f, JSON.stringify(config, null, 2) + "\n");
  return true;
}

/**
 * Write-through for the drive's ad-hoc override flags (`--deploy-target`,
 * `--no-sizing`). These are WRITERS, not parallel readers: a flag persists its
 * value into sftdd-config.json so the file stays the single source of truth.
 * No-op when no override is given, so a plain run never mutates the file. Loads
 * the existing config (or the default when none) so unrelated fields are kept.
 *
 * `--gates` is intentionally NOT here: it is the HITL POLICY, and a run-scoped
 * flag must never rewrite the project's declared policy (that let one headless
 * `--gates proxy` invocation permanently flip an interactive project to proxy).
 * The drive resolves the effective gate mode as `--gates ?? project.gates` per
 * run and records it run-scoped in run-config.json; sftdd-config.json stays
 * authoritative and is only changed by editing the file.
 */
export function applyProjectOverrides(
  projectDir: string,
  over: { deployTarget?: string; sizing?: boolean },
): void {
  if (over.deployTarget === undefined && over.sizing === undefined) return;
  const cfg = loadSftddConfig(projectDir) ?? defaultSftddConfig();
  cfg.project = cfg.project ?? {};
  if (over.deployTarget !== undefined) cfg.project.deployTarget = over.deployTarget;
  cfg.plan = cfg.plan ?? {};
  if (over.sizing !== undefined) cfg.plan.sizing = over.sizing;
  writeSftddConfig(projectDir, cfg, { force: true });
}
