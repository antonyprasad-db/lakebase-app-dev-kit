// step-manifest: load + validate the per-step JSON manifests (the DATA face of a step)
// and index an action to its SINGLE manifest.
//
// A manifest is the data the orchestrator's standard (Template Method) execution reads to
// drive the fixed phases: the logical inputs it resolves + provides, the outputs (+ checker
// NAMES) it validates, the routing map, the agent levers, and any post-turn CLIs. Only the
// checker fn bodies (checker-registry.ts) and the agent spawn (ClaudeStepAgent) stay code.
//
// Validation reuses the shared Ajv loader (getValidator) , the SAME compilation truth every
// other artifact uses, no new Ajv instance. Resolving a checker NAME to its fn is the
// registry's job (resolveChecker); an unknown name is caught THERE, not here (the schema
// cannot know registry contents).

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { getValidator, formatSchemaErrors } from "./schema-loader.js";
import type { WorkflowAction } from "./orchestrator-drive.js";

/** A step's logical input , resolved from .sftdd by the orchestrator and provided by id. */
export interface StepManifestInput {
  id: string;
  /** .sftdd source locator, e.g. "feature:product-overview.md". */
  source: string;
  description?: string;
}

/** A step's produced output , validated by an in-code checker resolved from the registry. */
export interface StepManifestOutput {
  id: string;
  /** Filename within the provided workspace the agent writes. */
  filename: string;
  /** Registered OutputChecker name (checker-registry.ts). */
  checker: string;
  description?: string;
}

/** Where one StepOutcome proposes to go. `next` may be a WorkflowAction or "state-derived". */
export interface StepManifestRouteTarget {
  next?: unknown;
  retry?: boolean;
  gate?: string;
  [k: string]: unknown;
}

/** The agent levers the executor builds AgentLevers from. */
export interface StepManifestAgentOptions {
  model?: string;
  effort?: "low" | "default" | "high";
  session: "fresh" | "resume";
  resumeKeyFrom?: "role" | "story" | "feature" | "none";
  toolScope?: { allowed?: string[]; disallowed?: string[] };
  fallbackModel?: string;
  maxBudgetUsd?: number;
}

/** One post-turn deterministic CLI (record/log phase). */
export interface StepManifestPostTurn {
  bin: string;
  args: string[];
  when?: "before" | "after";
}

/**
 * The DATA face of one step. `match` is a STRICT SUBSET of a WorkflowAction: every field it
 * carries must equal the action's field for a match. The loader rejects an ambiguous overlap
 * (two manifests matching one action).
 */
export interface StepManifest {
  id: string;
  role: string;
  match: Record<string, unknown>;
  inputs: StepManifestInput[];
  outputs: StepManifestOutput[];
  routing: {
    produced: StepManifestRouteTarget;
    blocked?: StepManifestRouteTarget;
    revise?: StepManifestRouteTarget;
    escalate?: StepManifestRouteTarget;
  };
  agentOptions: StepManifestAgentOptions;
  postTurn?: StepManifestPostTurn[];
}

/** The result of a shape validation , shape mirrors OutputCheckResult for consistency. */
export interface ManifestValidateResult {
  ok: boolean;
  violations: string[];
}

const SCHEMA = "step-manifest.schema.json";

/** Validate a manifest object's SHAPE against step-manifest.schema.json. */
export function validateStepManifest(manifest: StepManifest): ManifestValidateResult {
  const validate = getValidator(SCHEMA);
  if (validate(manifest)) return { ok: true, violations: [] };
  return { ok: false, violations: formatSchemaErrors(validate) };
}

/** The directory shipped step manifests live in. */
const MANIFEST_DIR = join(__dirname, "step-manifests");

/**
 * Load every shipped step-manifests/*.json. Missing dir -> empty (the feature is opt-in;
 * absence must not throw). Each file is parsed but NOT shape-validated here , callers
 * validate (the loader test asserts every shipped manifest conforms).
 */
export function loadStepManifests(dir: string = MANIFEST_DIR): StepManifest[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as StepManifest);
}

/**
 * Strict subset-match: `match` matches `action` iff every field on `match` is deep-equal to
 * the same field on `action`. Extra action fields are ignored (the match is a subset). A
 * field absent from the action never matches a present match field.
 */
export function matchesAction(match: Record<string, unknown>, action: WorkflowAction): boolean {
  const act = action as unknown as Record<string, unknown>;
  for (const [k, v] of Object.entries(match)) {
    if (!deepEqual(v, act[k])) return false;
  }
  return true;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (typeof a !== "object") return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((x, i) => deepEqual(x, b[i]));
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const ak = Object.keys(ao);
  const bk = Object.keys(bo);
  if (ak.length !== bk.length) return false;
  return ak.every((k) => deepEqual(ao[k], bo[k]));
}

/**
 * The single manifest that matches an action, or undefined when none do. THROWS loud when
 * more than one matches (an ambiguous overlap is a manifest-authoring bug the orchestrator
 * must never silently resolve). Defaults to the shipped manifests when no list is passed.
 */
export function manifestForAction(
  action: WorkflowAction,
  manifests: StepManifest[] = loadStepManifests(),
): StepManifest | undefined {
  const hits = manifests.filter((m) => matchesAction(m.match, action));
  if (hits.length > 1) {
    const ids = hits.map((m) => m.id).join(", ");
    throw new Error(
      `step-manifest: ambiguous match , ${hits.length} manifests match action ${JSON.stringify(action)}: ${ids}. Each action must map to exactly one manifest; tighten a match.`,
    );
  }
  return hits[0];
}
