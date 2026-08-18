// experiment-config: an optimization experiment is DECLARATIVE data, not hardcoded TS. A config file
// names the corpus TURN whose recorded preconditions are replayed (held constant) and the CANDIDATES ,
// each a set of LEVERS that perturb that baseline. The run picks up the config and executes it; nothing
// about which turn or which levers is baked into the harness. See
// [[feedback_experiments_replay_corpus_preconditions]]. Dependency-light (fs) + unit-testable.
import { readFileSync } from "fs";
import type { RoleCandidate, RoleLeverPatch } from "./role-levers.js";

/** A candidate's CONTEXT lever, expressed declaratively. `append` LEVERAGES the recorded prompt and adds
 *  the named context blocks after it (the default, faithful mode); `replace` swaps the whole context
 *  bundle (a distinct lever). Additive-vs-replacement is itself the lever the user calls out. */
export interface ContextLeverSpec {
  mode: "append" | "replace";
  /** For append: the context blocks to add (currently "failing-test"; "scope-note"/"db-state" wired via ctxPack). */
  include?: ("failing-test" | "scope-note" | "db-state" | "migration")[];
  /** For replace: the named alternative context bundle (future; validated but not yet dispatchable). */
  bundle?: string;
}

/** The lever patch a candidate applies, as written in the config JSON. Mirrors RoleLeverPatch's swept
 *  fields plus the declarative `context` (normalized to ctxPack for append). */
export interface ExperimentLeverSpec {
  model?: string;
  effort?: string;
  uiTrack?: boolean;
  loopGranularity?: "story" | "ac" | "hybrid-a";
  deployTarget?: "local" | "workspace";
  buildSessionScope?: "cycle" | "story";
  batchCap?: number;
  allowedTools?: string[];
  disallowedTools?: string[];
  guardSuite?: boolean;
  guardScan?: boolean;
  context?: ContextLeverSpec;
}

/** One candidate in the experiment: a stable id + its lever patch. */
export interface ExperimentCandidateSpec {
  id: string;
  levers: ExperimentLeverSpec;
}

/** A full experiment: the corpus turn (fixed preconditions) + the candidates (the only perturbations). */
export interface ExperimentConfig {
  name: string;
  /** Corpus turn label whose replay-set + recorded-artifacts are the preconditions (e.g. "0156-driver"). */
  turn: string;
  /** The story AC the turn targets (identifies the artifact copy). */
  ac: string;
  /** The driver turn kind. Derived from the turn label when omitted (…-repair / …-refactor / else green). */
  driverTurn?: "green" | "repair" | "refactor";
  concurrency?: number;
  replicas?: number;
  candidates: ExperimentCandidateSpec[];
}

/** The turn label's kind: "…-driver-repair" -> repair, "…-driver-refactor" -> refactor, else green. */
export function driverTurnFromLabel(turn: string): "green" | "repair" | "refactor" {
  if (/-repair\b/.test(turn) || turn.endsWith("-repair")) return "repair";
  if (/-refactor\b/.test(turn) || turn.endsWith("-refactor")) return "refactor";
  return "green";
}

/** Normalize a declarative lever spec to the harness RoleLeverPatch. `context.append` -> ctxPack (the
 *  context blocks the driver cfg appends to the recorded prompt via contextPackSuffix); `context.replace`
 *  is accepted + validated but not yet dispatchable (throws at load so it fails loud, not silently). */
function toLeverPatch(spec: ExperimentLeverSpec, candidateId: string): RoleLeverPatch {
  const patch: RoleLeverPatch = {};
  if (spec.model !== undefined) patch.model = spec.model;
  if (spec.effort !== undefined) patch.effort = spec.effort;
  if (spec.uiTrack !== undefined) patch.uiTrack = spec.uiTrack;
  if (spec.loopGranularity !== undefined) patch.loopGranularity = spec.loopGranularity;
  if (spec.deployTarget !== undefined) patch.deployTarget = spec.deployTarget;
  if (spec.buildSessionScope !== undefined) patch.buildSessionScope = spec.buildSessionScope;
  if (spec.batchCap !== undefined) patch.batchCap = spec.batchCap;
  if (spec.allowedTools !== undefined) patch.allowedTools = spec.allowedTools;
  if (spec.disallowedTools !== undefined) patch.disallowedTools = spec.disallowedTools;
  if (spec.guardSuite !== undefined) patch.guardSuite = spec.guardSuite;
  if (spec.guardScan !== undefined) patch.guardScan = spec.guardScan;
  if (spec.context) {
    if (spec.context.mode === "append") {
      patch.ctxPack = spec.context.include ?? ["failing-test"];
    } else if (spec.context.mode === "replace") {
      throw new Error(`candidate "${candidateId}": context.mode "replace" is not yet dispatchable (append only for now)`);
    } else {
      throw new Error(`candidate "${candidateId}": context.mode must be "append" or "replace"`);
    }
  }
  return patch;
}

/** Load + validate an experiment config, returning it with candidates normalized to RoleCandidate[]. */
export function loadExperimentConfig(path: string): ExperimentConfig & { roleCandidates: RoleCandidate[] } {
  const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<ExperimentConfig>;
  if (!raw.name || typeof raw.name !== "string") throw new Error(`experiment config ${path}: missing "name"`);
  if (!raw.turn || typeof raw.turn !== "string") throw new Error(`experiment config ${path}: missing "turn" (the corpus turn label)`);
  if (!raw.ac || typeof raw.ac !== "string") throw new Error(`experiment config ${path}: missing "ac"`);
  if (!Array.isArray(raw.candidates) || raw.candidates.length === 0) throw new Error(`experiment config ${path}: "candidates" must be a non-empty array`);
  const seen = new Set<string>();
  const roleCandidates: RoleCandidate[] = raw.candidates.map((c) => {
    if (!c.id || typeof c.id !== "string") throw new Error(`experiment config ${path}: a candidate is missing "id"`);
    if (seen.has(c.id)) throw new Error(`experiment config ${path}: duplicate candidate id "${c.id}"`);
    seen.add(c.id);
    return { id: c.id, levers: toLeverPatch(c.levers ?? {}, c.id) };
  });
  return {
    name: raw.name,
    turn: raw.turn,
    ac: raw.ac,
    driverTurn: raw.driverTurn ?? driverTurnFromLabel(raw.turn),
    ...(raw.concurrency !== undefined ? { concurrency: raw.concurrency } : {}),
    ...(raw.replicas !== undefined ? { replicas: raw.replicas } : {}),
    candidates: raw.candidates,
    roleCandidates,
  };
}
