// The `.lakebase/consort-config.json` FILE primitive , the low config layer that reads/writes the
// on-disk project settings and resolves the non-model half (build/plan/project) from file -> code
// default. It imports only config-layer modules (step-key types, agent-models, agent-log's AgentRole
// type) so ANY layer may depend on it downward: the settings RESOLVER (which layers model/effort on
// top, needing manifests + the turn-key map) AND the domain modules that only touch the file
// (intake reads project.uiTrack; project-consort-setup writes the default). Splitting the file half
// DOWN here is what makes the graph acyclic , a domain no longer reaches UP into the resolver.
//
// Model knobs mirror what `claude -p` exposes: model, effort (low|medium|high|xhigh|max|default),
// fallbackModel, maxBudgetUsd. Their RESOLUTION is the resolver's job (project-settings.ts); this
// module only carries the on-disk SHAPE + the settings that need no model/turn-key machinery.

import { existsSync, readFileSync, mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import type { AgentRole } from "../logging/agent-log.js";
import { ALL_AGENT_ROLES, type SpawnableAgentRole } from "./agent-models.js";
import type { TurnKey, EffortLevel } from "./step-key.js";
// The RECOMMENDED_MODELS base default the scaffold seeds; agent-models is a config-layer module.
import { RECOMMENDED_MODELS } from "./agent-models.js";
// Auto-applied optimization winners, deep-merged onto the base default (see defaultConsortConfig).
// Static import so tsup inlines it into dist at build time; the champion walk's auto-apply writes
// this file as DATA, never a TS rewrite.
import OPTIMIZED_DEFAULTS from "./optimized-defaults.json";

// AgentRole is referenced only to keep the type surface identical for re-exporters.
export type { AgentRole };

/** Project-relative path of the unified config (canonical name, Consort era). */
export const CONSORT_CONFIG_REL = join(".lakebase", "consort-config.json");
/** Legacy config filenames, newest-first, still READ (tri-read) so projects
 *  scaffolded before a rename keep working until they migrate. New writes use
 *  CONSORT_CONFIG_REL. `sftdd-config.json` was the prior canonical name;
 *  `tdd-config.json` the one before that. */
export const LEGACY_CONFIG_RELS = [
  join(".lakebase", "sftdd-config.json"),
  join(".lakebase", "tdd-config.json"),
] as const;
/** @deprecated use CONSORT_CONFIG_REL. Kept as aliases for callers not yet updated. */
export const SFTDD_CONFIG_REL = CONSORT_CONFIG_REL;
/** @deprecated use CONSORT_CONFIG_REL. */
export const TDD_CONFIG_REL = CONSORT_CONFIG_REL;
/** @deprecated the immediate-predecessor legacy read path (`sftdd-config.json`). */
export const LEGACY_TDD_CONFIG_REL = LEGACY_CONFIG_RELS[0];

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

export interface ConsortConfigFile {
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

/** The non-model half of the resolved settings (build/plan/project) , the portion that
 *  needs no per-step model/effort machinery, so it resolves purely from the file here. */
export interface ProjectFileSettings {
  build: { loopGranularity: "story" | "ac" | "hybrid-a"; batchCap?: number; sessionScope: "story" | "cycle" };
  plan: { sizing: boolean };
  project: {
    uiTrack: boolean;
    gates: "interactive" | "proxy";
    deployTarget: string;
    clientFramework: "react" | "none";
  };
}

/** Read `.lakebase/consort-config.json` (canonical), falling back through the
 *  legacy names (`sftdd-config.json`, then `tdd-config.json`) for projects
 *  scaffolded before a rename. Undefined when none exists / the first found is
 *  unparseable. */
export function loadConsortConfig(projectDir: string): ConsortConfigFile | undefined {
  for (const rel of [CONSORT_CONFIG_REL, ...LEGACY_CONFIG_RELS]) {
    const f = join(projectDir, rel);
    if (!existsSync(f)) continue;
    try {
      return JSON.parse(readFileSync(f, "utf8")) as ConsortConfigFile;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/**
 * Resolve the non-model project settings (build/plan/project) from the file -> code
 * default. The file is the SINGLE source of truth; there is no env override. The model/
 * effort layer is resolved ON TOP by resolveConsortSettings (project-settings.ts), which
 * needs the manifests + turn-key map; keeping this half here lets a domain that only reads
 * project.uiTrack (intake) depend DOWNWARD on the file primitive.
 */
export function resolveProjectSettings(projectDir: string): ProjectFileSettings {
  const file = loadConsortConfig(projectDir);
  const build = {
    loopGranularity: (file?.build?.loopGranularity ?? "story") as "story" | "ac" | "hybrid-a",
    batchCap: file?.build?.batchCap,
    sessionScope: (file?.build?.sessionScope ?? "story") as "story" | "cycle",
  };
  const project = {
    uiTrack: file?.project?.uiTrack ?? true,
    // HITL-first: the declared project policy defaults to interactive (a human
    // approves each gate). Headless (proxy) is a deliberate opt-in, set in the
    // file or as a RUN-SCOPED --gates override (never persisted by a flag).
    gates: (file?.project?.gates ?? "interactive") as "interactive" | "proxy",
    deployTarget: file?.project?.deployTarget ?? "local",
    clientFramework: (file?.project?.clientFramework ?? "none") as "react" | "none",
  };
  const plan = { sizing: file?.plan?.sizing ?? true };
  return { build, plan, project };
}

/** A default config seeded from the recommended models (for scaffold / `--init`),
 *  with the navigator REVIEW effort pinned low (the P6 default made explicit). */
export function defaultConsortConfig(): ConsortConfigFile {
  const roles = {} as Record<SpawnableAgentRole, RoleSettingsFile>;
  for (const role of ALL_AGENT_ROLES) {
    roles[role] =
      role === "navigator"
        ? // Model tiering: the RED turn (whole-story failing-test authoring) is the
          // Navigator's heaviest reasoning turn , it reads the architecture, NFRs, and
          // the full test list and writes every failing test in one batch , so it runs
          // on opus. REVIEW/ASSESS/REFLECT are lighter judgment turns and stay on the
          // role base (sonnet) with review at low effort. A per-turn map (like driver's)
          // overrides only `red`; the unnamed turns fall through to RECOMMENDED_MODELS.
          // Overridable per project by editing consort-config.json.
          { model: { red: "opus" }, effort: { review: "low" } }
        : role === "driver"
          ? // Model tiering: RED (test authoring) keeps the recommended (sonnet) base; the
            // mechanical REFACTOR turn drops to a fast model. GREEN runs on OPUS at MEDIUM effort
            // , the driver-green tuning study's faster-while-holding winner: opus + medium effort +
            // the failing-test context reached the clean-code + superseded-shift milestone reliably
            // (3/3) at ~237s, beating sonnet and every other config; lower effort was unreliable,
            // higher was slower, and added context (scope/migration) was latency. See
            // consort/optimize/DRIVER-GREEN-LEVERS.md. Overridable per project by editing
            // consort-config.json (a project can flatten to a scalar `model`).
            { model: { red: RECOMMENDED_MODELS[role], green: "opus", refactor: "haiku" }, effort: { green: "medium" } }
          : // Every other role's base is just its recommended model. Optimization
            // winners (e.g. spec-author breakdown -> haiku+low) are NOT hardcoded here;
            // they live in optimized-defaults.json and are deep-merged below, so the
            // champion walk's auto-apply is the single writer of applied winners.
            { model: RECOMMENDED_MODELS[role] };
  }
  const base: ConsortConfigFile = {
    version: 1,
    roles,
    build: { loopGranularity: "story", batchCap: 3, sessionScope: "story" },
    plan: { sizing: true },
    project: { uiTrack: true, gates: "interactive", deployTarget: "local", clientFramework: "none" },
  };
  // Deep-merge the auto-applied optimization winners (optimized-defaults.json) on top.
  // The champion walk's auto-apply writes DATA into that file (never a TS rewrite, so
  // the "one source of truth / no source regex" rule holds); it is inlined into dist at
  // build time. A winner keyed per-turn/step (e.g. spec-author.breakdown -> haiku) is
  // merged element-wise so it augments the base rather than replacing a whole map.
  return mergeOptimizedDefaults(base, OPTIMIZED_DEFAULTS as Partial<ConsortConfigFile>);
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

/** Write a consort-config.json (scaffold/init). Does not overwrite unless force. */
export function writeConsortConfig(projectDir: string, config: ConsortConfigFile, opts?: { force?: boolean }): boolean {
  const f = join(projectDir, CONSORT_CONFIG_REL);
  if (existsSync(f) && !opts?.force) return false;
  mkdirSync(dirname(f), { recursive: true });
  writeFileSync(f, JSON.stringify(config, null, 2) + "\n");
  return true;
}

/**
 * Write-through for the drive's ad-hoc override flags (`--deploy-target`,
 * `--no-sizing`). These are WRITERS, not parallel readers: a flag persists its
 * value into consort-config.json so the file stays the single source of truth.
 * No-op when no override is given, so a plain run never mutates the file. Loads
 * the existing config (or the default when none) so unrelated fields are kept.
 *
 * `--gates` is intentionally NOT here: it is the HITL POLICY, and a run-scoped
 * flag must never rewrite the project's declared policy (that let one headless
 * `--gates proxy` invocation permanently flip an interactive project to proxy).
 * The drive resolves the effective gate mode as `--gates ?? project.gates` per
 * run and records it run-scoped in run-config.json; consort-config.json stays
 * authoritative and is only changed by editing the file.
 */
export function applyProjectOverrides(
  projectDir: string,
  over: { deployTarget?: string; sizing?: boolean },
): void {
  if (over.deployTarget === undefined && over.sizing === undefined) return;
  const cfg = loadConsortConfig(projectDir) ?? defaultConsortConfig();
  cfg.project = cfg.project ?? {};
  if (over.deployTarget !== undefined) cfg.project.deployTarget = over.deployTarget;
  cfg.plan = cfg.plan ?? {};
  if (over.sizing !== undefined) cfg.plan.sizing = over.sizing;
  writeConsortConfig(projectDir, cfg, { force: true });
}
