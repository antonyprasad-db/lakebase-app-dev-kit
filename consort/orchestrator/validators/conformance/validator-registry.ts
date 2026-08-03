// validator-registry: the CODE face of a step's outputs , named, deterministic
// OutputValidator fns a manifest references BY NAME. The manifest is DATA (it carries the
// validator name); this registry maps that name to the actual in-code check. A manifest
// typo (an unknown name) is a HARD failure at resolve time, never a silent skip , the
// same fail-loud philosophy as MockStepContract's missing-route throw.
//
// The validators themselves live here so both the orchestrator (validate-outputs phase) and
// the agent (via a step's conformanceValidators, self-check in-turn) run the SAME fn. The
// first two are the breakdown step's validators, lifted from spec-author-breakdown-step.ts;
// that file now re-exports them so existing importers keep working.

import { readFileSync } from "node:fs";
import { checkArtifactConformance } from "../../../../scripts/sftdd/artifact-conformance.js";
import { getValidator, formatSchemaErrors } from "../../../../scripts/sftdd/schema-loader.js";
import type { OutputValidator, OutputValidationResult } from "../../contract/step-contract.js";

/**
 * feature-spec validator: the produced feature-spec.json must parse + conform to
 * feature.schema.json AND carry a non-empty stories[] (the breakdown deliverable).
 * Deterministic , the orchestrator ACCEPTS/REJECTS on this, never a follow-up to the agent.
 */
export function featureSpecNonEmptyStories(producedPath: string): OutputValidationResult {
  let content: string;
  try {
    content = readFileSync(producedPath, "utf8");
  } catch {
    return { ok: false, violations: [`feature-spec.json not readable at ${producedPath}`] };
  }
  const conf = checkArtifactConformance("feature-spec.json", content);
  if (!conf.ok) return { ok: false, violations: conf.violations };
  try {
    const spec = JSON.parse(content) as { stories?: unknown };
    if (!Array.isArray(spec.stories) || spec.stories.length === 0) {
      return { ok: false, violations: ["feature-spec.json has an empty or missing stories[] (the breakdown must enumerate >=1 story)"] };
    }
  } catch (e) {
    return { ok: false, violations: [`feature-spec.json is not valid JSON: ${e instanceof Error ? e.message : String(e)}`] };
  }
  return { ok: true, violations: [] };
}

/**
 * agent-log validator: the produced agent-log.jsonl must have >=1 line, each a JSON object
 * conforming to agent-log-event.schema.json, and at least one line from THIS role recording
 * what it did. This is how "the agent logs what it did + surfaces issues" is enforced
 * deterministically. Parameterized by the role that must appear.
 */
export function agentLogHasRoleEvent(producedPath: string, role = "spec-author"): OutputValidationResult {
  let raw: string;
  try {
    raw = readFileSync(producedPath, "utf8");
  } catch {
    return { ok: false, violations: [`agent-log.jsonl not readable at ${producedPath} (the agent must log what it did via the shared agent-log script)`] };
  }
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) {
    return { ok: false, violations: ["agent-log.jsonl is empty (the agent must log at least one event: what it did / any issue surfaced)"] };
  }
  const validate = getValidator("agent-log-event.schema.json");
  const violations: string[] = [];
  let sawRoleEvent = false;
  for (const [i, line] of lines.entries()) {
    let obj: unknown;
    try {
      obj = JSON.parse(line);
    } catch {
      violations.push(`agent-log.jsonl line ${i + 1} is not valid JSON`);
      continue;
    }
    if (!validate(obj)) {
      violations.push(`agent-log.jsonl line ${i + 1}: ${formatSchemaErrors(validate).join("; ")}`);
      continue;
    }
    if ((obj as { role?: string }).role === role) sawRoleEvent = true;
  }
  if (!sawRoleEvent && violations.length === 0) {
    violations.push(`agent-log.jsonl has no ${role} event (the role must log what it did)`);
  }
  return { ok: violations.length === 0, violations };
}

/**
 * nonEmptyFile validator: the produced file exists and carries non-whitespace content. The
 * generic "the human/agent actually authored something here" check , used for the PO's
 * seed markdown (product-overview.md / nfrs.md / design-brief.md), where the deliverable is
 * prose, not a schema-validated artifact.
 */
export function nonEmptyFile(producedPath: string): OutputValidationResult {
  let content: string;
  try {
    content = readFileSync(producedPath, "utf8");
  } catch {
    return { ok: false, violations: [`file not readable at ${producedPath}`] };
  }
  if (content.trim().length === 0) {
    return { ok: false, violations: [`file at ${producedPath} is empty (expected authored content)`] };
  }
  return { ok: true, violations: [] };
}

/**
 * The named-validator registry a manifest resolves against. Add an entry here (code) and
 * reference it by name in a manifest (data). Every OutputValidator is (path) => result , the
 * role-parameterized agent-log validator binds its default role so it matches the signature.
 */
export const VALIDATOR_REGISTRY: Record<string, OutputValidator> = {
  featureSpecNonEmptyStories,
  agentLogHasRoleEvent: (p: string) => agentLogHasRoleEvent(p),
  // The PO's structured log event is authored as product-owner; bind that role.
  productOwnerLoggedAuthoring: (p: string) => agentLogHasRoleEvent(p, "product-owner"),
  nonEmptyFile,
};

/**
 * Resolve a validator name to its fn. THROWS loud on an unknown name , a manifest typo is a
 * hard failure surfaced at load/validate time, not a silently-skipped output check.
 */
export function resolveValidator(name: string): OutputValidator {
  const fn = VALIDATOR_REGISTRY[name];
  if (!fn) {
    const known = Object.keys(VALIDATOR_REGISTRY).sort().join(", ");
    throw new Error(`validator-registry: unknown validator "${name}" (a manifest referenced a validator not in the registry). Known: ${known}.`);
  }
  return fn;
}
