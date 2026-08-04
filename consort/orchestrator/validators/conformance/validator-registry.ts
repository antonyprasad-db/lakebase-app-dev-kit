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

import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { join } from "node:path";
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
 * design-guide validator: the produced design-guide.json must parse + conform to
 * design-guide.schema.json (the token + component shape the UX Designer emits, which the
 * downstream design-adherence gate checks). Deterministic , the same conformance the response
 * self-check runs. Used for the ux-designer step's output.
 */
export function designGuideConformant(producedPath: string): OutputValidationResult {
  let content: string;
  try {
    content = readFileSync(producedPath, "utf8");
  } catch {
    return { ok: false, violations: [`design-guide.json not readable at ${producedPath}`] };
  }
  const conf = checkArtifactConformance("design-guide.json", content);
  return conf.ok ? { ok: true, violations: [] } : { ok: false, violations: conf.violations };
}

/**
 * Generic schema-conformance validator factory: read the produced file and check it against
 * one of the kit's canonical artifact schemas (via the SAME checkArtifactConformance the design
 * gate + response self-check use, so a manifest output is gated to the exact schema its role
 * ships). Used for the design-role INTEGRATION live chains, where a real agent authors the
 * artifact and the orchestrator must reject a non-conformant one (not merely a non-empty file).
 */
function conformsTo(artifactName: string): OutputValidator {
  return (producedPath: string): OutputValidationResult => {
    let content: string;
    try {
      content = readFileSync(producedPath, "utf8");
    } catch {
      return { ok: false, violations: [`${artifactName} not readable at ${producedPath}`] };
    }
    const conf = checkArtifactConformance(artifactName, content);
    return conf.ok ? { ok: true, violations: [] } : { ok: false, violations: conf.violations };
  };
}

/**
 * navigatorTestsAuthored validator: the Navigator's RED turn writes TEST code under tests/. The
 * deterministic floor is "a non-empty tests/ tree exists" (the coverage+faithfulness judgment is
 * the opus RED-coverage judge, not this check). producedPath is the tests/ dir (existsSync passes
 * for a dir). Passes iff it is a directory holding >=1 test file (.py/.ts/.tsx).
 */
export function navigatorTestsAuthored(producedPath: string): OutputValidationResult {
  if (!existsSync(producedPath) || !statSync(producedPath).isDirectory()) {
    return { ok: false, violations: [`navigator RED wrote no tests/ tree at ${producedPath}`] };
  }
  const isTest = (n: string): boolean => /\.(py|ts|tsx)$/.test(n);
  const walk = (dir: string): boolean => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, e.name);
      if (e.isDirectory()) {
        if (walk(abs)) return true;
      } else if (isTest(e.name)) {
        return true;
      }
    }
    return false;
  };
  return walk(producedPath)
    ? { ok: true, violations: [] }
    : { ok: false, violations: [`navigator RED tests/ tree at ${producedPath} has no test file (.py/.ts/.tsx)`] };
}

/**
 * assessMarkerWritten validator: the Navigator's ASSESS turn discriminates the driver's failed
 * GREEN and writes EXACTLY ONE marker into the AC cycle dir , either superseded-tests.json
 * {tests,reason} (the AC supersedes prior tests) OR regression-assessment.json {diagnosis,
 * fixDirective?} (a genuine regression). producedPath is the AC cycle dir. Passes iff one is
 * present + well-formed (the ALIGNMENT-vs-oracle judgment is the live test's job, not this floor).
 */
export function assessMarkerWritten(producedPath: string): OutputValidationResult {
  const sup = join(producedPath, "superseded-tests.json");
  const reg = join(producedPath, "regression-assessment.json");
  const hasSup = existsSync(sup);
  const hasReg = existsSync(reg);
  if (!hasSup && !hasReg) {
    return { ok: false, violations: [`assess wrote no marker (expected superseded-tests.json OR regression-assessment.json) in ${producedPath}`] };
  }
  if (hasSup) {
    try {
      const j = JSON.parse(readFileSync(sup, "utf8")) as { tests?: unknown; reason?: unknown };
      if (!Array.isArray(j.tests) || j.tests.length === 0 || typeof j.reason !== "string" || !j.reason.trim()) {
        return { ok: false, violations: [`superseded-tests.json malformed (need non-empty tests[] + a reason) in ${producedPath}`] };
      }
    } catch (e) {
      return { ok: false, violations: [`superseded-tests.json invalid JSON: ${e instanceof Error ? e.message : String(e)}`] };
    }
  }
  if (hasReg) {
    try {
      const j = JSON.parse(readFileSync(reg, "utf8")) as { diagnosis?: unknown };
      if (typeof j.diagnosis !== "string" || !j.diagnosis.trim()) {
        return { ok: false, violations: [`regression-assessment.json malformed (need a non-empty diagnosis) in ${producedPath}`] };
      }
    } catch (e) {
      return { ok: false, violations: [`regression-assessment.json invalid JSON: ${e instanceof Error ? e.message : String(e)}`] };
    }
  }
  return { ok: true, violations: [] };
}

/** Per-artifact schema-conformance validators (the design roles' primary outputs), each
 *  gated to its canonical schema via checkArtifactConformance. */
export const acConformant = conformsTo("ac.json");
export const architectureConformant = conformsTo("architecture.json");
export const dbDesignConformant = conformsTo("db-design.json");
export const testListConformant = conformsTo("test-list.json");

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
  // The UX Designer's structured log event is authored as ux-designer; bind that role.
  uxDesignerLoggedAuthoring: (p: string) => agentLogHasRoleEvent(p, "ux-designer"),
  // The Test Strategist's + Architect Reviewer's + DBA's log events, role-bound (used by the
  // route-scenario manifests that exercise those roles' escalation/produced routes, and by the
  // shipped design-role manifests whose logged-authoring output is the role's agent-log line).
  testStrategistLoggedAuthoring: (p: string) => agentLogHasRoleEvent(p, "test-strategist"),
  architectReviewerLoggedAuthoring: (p: string) => agentLogHasRoleEvent(p, "architect-reviewer"),
  dbaLoggedAuthoring: (p: string) => agentLogHasRoleEvent(p, "dba"),
  // The Navigator's log event (build turns: RED / assess / review), role-bound.
  navigatorLoggedAuthoring: (p: string) => agentLogHasRoleEvent(p, "navigator"),
  nonEmptyFile,
  designGuideConformant,
  // BUILD-turn navigator output validators (the lean per-role build chains).
  navigatorTestsAuthored,
  assessMarkerWritten,
  // Schema-conformance validators for the design roles' primary artifacts (the integration
  // live chains gate the real agent's output to its canonical schema, not just non-emptiness).
  acConformant,
  architectureConformant,
  dbDesignConformant,
  testListConformant,
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
