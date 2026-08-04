// optimize-semantic-gate: the SEMANTIC-similarity quality bar for a design-turn
// candidate. The structural self-check (optimize-gate.evaluateDesignGate) proves an
// artifact is well-FORMED; this proves it is well-MEANING , that a candidate's
// artifact conveys the SAME design/behavior as the artifact recorded at that same
// step in the reference corpus, regardless of wording, slug, or how content is
// split. A cheaper/faster model that drops material intent (a design-guide missing
// the status-badge concept, a spec missing a behavior) must be disqualified no
// matter how fast it was.
//
// "Comparable" is a SEMANTIC judgment, not a structural diff, so it is judged by an
// LLM-as-judge on a FIXED model (opus) , constant across candidates, so the bar
// never moves with the thing being measured. The judge scores coverage 0..1 and
// names what is missing; the gate passes at >= SEMANTIC_THRESHOLD. The judge call is
// made AFTER the timed spawn (the harness stops its clock first), so it never
// pollutes the wall-clock measurement.
//
// Reference resolution: canonical `stockflow` for every step EXCEPT dba, which uses
// `stockflow-rerecord` (the only corpus that recorded db-design.json). Steps with no
// recorded reference (or a scenario without the corpus on disk) skip the semantic
// bar and fall through to the structural floor alone.

import { execFile } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { TurnKey } from "./sftdd-config.js";
import { designGuideJson, featureSpecJson, architectureJson, featureTestListJson, dbDesignJson, featureProposalsMd, planningEstimatesJson, acsDir, storiesDir, featureDir } from "./sftdd-paths.js";

/** The .tdd-layout artifact path for a step, built via sftdd-paths (the single source
 *  of truth for the layout). `base` is a .tdd-shaped root: the live project's .sftdd
 *  for the candidate, or a corpus's recorded-artifacts/ for the reference , both carry
 *  the identical features/<F>/... + design/... shape, so one builder set serves both.
 *  Returns null for a step whose artifact is per-story (acs), handled separately. */
function stepArtifactPath(base: string, step: TurnKey, featureId: string): string | null {
  switch (step) {
    case "ux":
      return designGuideJson(base);
    case "breakdown":
      return featureSpecJson(base, featureId);
    case "propose":
      // The Spec Author's sprint proposal , a project-level (not per-feature) artifact.
      return featureProposalsMd(base);
    case "architect":
      return architectureJson(base, featureId);
    case "estimate":
      // The Architect's feature-level t-shirt sizes , planning/estimates.json (NOT
      // architecture.json). estimate + architect are distinct artifacts by distinct actions.
      return planningEstimatesJson(base);
    case "test-list":
      return featureTestListJson(base, featureId);
    case "dba":
      return dbDesignJson(base, featureId);
    default:
      return null; // acs is per-story; build turns have no design artifact
  }
}

/** Where the reference corpora live, relative to the kit root. */
const SCENARIOS_REL = "examples/sftdd-scenarios";
const CANONICAL = "stockflow";
const RERECORD = "stockflow-rerecord";

/** Threshold on the judge's 0..1 score. DESIGN artifacts (prose/tokens) demand tight
 *  semantic coverage; BUILD artifacts (code/tests) get a LOOSER functional bar since
 *  code structure legitimately varies more than prose. */
export const SEMANTIC_THRESHOLD = 0.85;
export const FUNCTIONAL_THRESHOLD = 0.75;

/** A BUILD turn's role output kind, for functional-similarity comparison against the
 *  recorded-build reference: navigator authors TESTS (red/review), driver writes CODE
 *  (green/refactor/repair). Used to scope the comparison to the turn's OWN output. */
export type BuildOutputKind = "tests" | "code";
export function buildOutputKind(role: string): BuildOutputKind | undefined {
  if (role === "navigator") return "tests";
  if (role === "driver") return "code";
  return undefined;
}

/** The recorded reference for a step: which corpus + the artifact path(s) under its
 *  recorded-artifacts/ tree, and a human label. `perStoryGlob` marks steps whose
 *  artifact is per-story (acs) , the reference is the union across recorded stories,
 *  since slugs + per-story splits legitimately differ (semantic, not slug, match). */
export interface StepReference {
  corpus: string;
  /** Absolute paths to the recorded reference artifact(s) for this step. */
  paths: string[];
  label: string;
}

/** A design step's TurnKey -> which corpus is its semantic reference. dba compares
 *  against the re-record corpus (the only one with db-design.json); everything else
 *  against canonical stockflow (the production-quality front-end reference). */
function corpusForStep(step: TurnKey): string | undefined {
  switch (step) {
    case "dba":
      return RERECORD;
    case "breakdown":
    case "propose":
    case "acs":
    case "architect":
    case "estimate":
    case "test-list":
    case "ux":
      return CANONICAL;
    default:
      return undefined; // build turns + unknown steps have no design reference
  }
}

/** Resolve the recorded reference artifact(s) for a step in a corpus, or null if the
 *  corpus / artifact is not on disk (scenario without a recorded reference). */
export function resolveStepReference(args: {
  kitRoot: string;
  step: TurnKey;
  featureId: string;
}): StepReference | null {
  const { kitRoot, step, featureId } = args;
  const corpus = corpusForStep(step);
  if (!corpus) return null;
  // A corpus's recorded-artifacts/ is .tdd-shaped (features/<F>/..., design/...), so
  // the sftdd-paths builders resolve reference paths the same as live .sftdd paths.
  const root = join(kitRoot, SCENARIOS_REL, corpus, "recorded-artifacts");
  if (!existsSync(root)) return null;

  if (step === "acs") {
    // Per-story ACs: the reference is the UNION of every recorded story's ACs (slugs
    // + per-story split differ legitimately; the semantic bar is feature-aggregate
    // coverage, not per-slug alignment). Story + acs dirs come from sftdd-paths.
    const sdir = storiesDir(root, featureId);
    if (!existsSync(sdir)) return null;
    const paths: string[] = [];
    for (const story of readdirSync(sdir)) {
      const adir = acsDir(root, featureId, story);
      if (!existsSync(adir)) continue;
      for (const ac of readdirSync(adir)) if (ac.endsWith(".json")) paths.push(join(adir, ac));
    }
    return paths.length ? { corpus, paths, label: "stories/*/acs/*.json (feature-aggregate)" } : null;
  }

  const p = stepArtifactPath(root, step, featureId);
  if (!p || !existsSync(p)) return null;
  return { corpus, paths: [p], label: p.slice(root.length + 1) };
}

/** Read + concatenate the candidate's produced artifact(s) for a step from the live
 *  .sftdd, mirroring resolveStepReference's path selection so judge sees like-for-like. */
export function readCandidateArtifact(args: {
  sftddDir: string;
  step: TurnKey;
  featureId: string;
}): string | null {
  const { sftddDir, step, featureId } = args;
  const readIf = (p: string): string | null => (existsSync(p) ? readFileSync(p, "utf8") : null);
  if (step === "acs") {
    const sdir = storiesDir(sftddDir, featureId);
    if (!existsSync(sdir)) return null;
    const parts: string[] = [];
    for (const story of readdirSync(sdir)) {
      const adir = acsDir(sftddDir, featureId, story);
      if (!existsSync(adir)) continue;
      for (const ac of readdirSync(adir)) if (ac.endsWith(".json")) parts.push(readFileSync(join(adir, ac), "utf8"));
    }
    return parts.length ? parts.join("\n---\n") : null;
  }
  const p = stepArtifactPath(sftddDir, step, featureId);
  return p ? readIf(p) : null;
}

/** The judge's verdict: a 0..1 semantic-coverage score + (on a miss) what material
 *  intent the candidate dropped relative to the reference. */
export interface SemanticVerdict {
  score: number;
  missing?: string[];
  raw?: string;
}

/** A BUILD-code DISCRIMINATOR classification, mirroring the navigator ASSESS turn's
 *  decision: is the produced code functionally equivalent (nothing to do), a
 *  legitimate behavior SHIFT that supersedes prior tests, a genuine REGRESSION, or
 *  INSUFFICIENT (unrecoverable / needs a human)? */
export type BuildClassification = "equivalent" | "superseded-shift" | "regression" | "insufficient";
/** The NEXT STEP a discriminator classification warrants (the assess turn's routing). */
export type BuildNextStep = "accept" | "permissive-refactor-superseded" | "driver-repair-with-directive" | "escalate";

/** A DISCRIMINATOR verdict over a build turn's code: the {score} bar PLUS the assess-
 *  style classification + the next step it warrants. A CLEAN verdict
 *  (equivalent/accept) is the BEST outcome (the candidate converged with no self-heal
 *  needed, beating the recorded baseline's assess->repair spiral), NEVER a miss. */
export interface DiscriminatorVerdict extends SemanticVerdict {
  classification: BuildClassification;
  nextStep: BuildNextStep;
  /** When classification=regression: the root-cause diagnosis (mirrors regression-assessment.json). */
  diagnosis?: string;
  /** When classification=regression and driver-fixable: the repair directive (its presence => fixable). */
  fixDirective?: string;
  /** When classification=superseded-shift: the prior tests the shift legitimately retires
   *  (mirrors superseded-tests.json), used by the navigator-assess alignment check. */
  supersededTests?: string[];
}

/** Injected LLM-as-judge: given the reference + candidate artifact text for a step,
 *  return a semantic-coverage verdict. Real impl spawns a FIXED opus `claude -p`
 *  (constant across candidates); stubbable for hermetic tests. */
export type SemanticJudge = (args: {
  step: TurnKey;
  reference: string;
  candidate: string;
  /** When set, this is a BUILD-output comparison: score FUNCTIONAL equivalence of
   *  code/tests (looser bar) rather than design-artifact semantic intent. */
  functional?: BuildOutputKind;
}) => Promise<SemanticVerdict | DiscriminatorVerdict>;

export interface SemanticGateOutcome {
  /** true = comparable (>= threshold) OR no reference exists (bar not applicable). */
  passed: boolean;
  /** The judged score, when a judgment was made (undefined when skipped). */
  score?: number;
  reason?: string;
  /** true when there was no recorded reference for this step -> bar skipped. */
  skipped?: boolean;
  /** BUILD-code discriminator fields (only on the build/functional path): the assess-
   *  style classification + the next step it warrants + any diagnosis/fixDirective.
   *  A clean equivalent/accept is the BEST result (passed:true); only "insufficient"
   *  fails. Absent on the design semantic path. */
  classification?: BuildClassification;
  nextStep?: BuildNextStep;
  diagnosis?: string;
  fixDirective?: string;
}

/** Evaluate a design candidate's artifact for SEMANTIC similarity to the recorded
 *  reference at its step. Pure orchestration over the injected judge + fs reads:
 *   - no reference on disk        => skipped:true, passed:true (structural floor only)
 *   - candidate artifact missing  => passed:false (nothing to compare; structural
 *                                     floor should already have caught it)
 *   - judge score >= threshold    => passed:true
 *   - below threshold             => passed:false, reason names what is missing
 *  Concatenates multi-file references (acs) into one reference block. */
export async function evaluateSemanticGate(args: {
  kitRoot: string;
  sftddDir: string;
  featureId: string;
  step: TurnKey;
  judge: SemanticJudge;
  threshold?: number;
}): Promise<SemanticGateOutcome> {
  const { kitRoot, sftddDir, featureId, step, judge } = args;
  const threshold = args.threshold ?? SEMANTIC_THRESHOLD;

  const ref = resolveStepReference({ kitRoot, step, featureId });
  if (!ref) return { passed: true, skipped: true };

  const candidate = readCandidateArtifact({ sftddDir, step, featureId });
  if (candidate === null) {
    return { passed: false, reason: `semantic: candidate produced no artifact for step '${step}' to compare against ${ref.label}` };
  }

  const reference = ref.paths.map((p) => readFileSync(p, "utf8")).join("\n---\n");
  const verdict = await judge({ step, reference, candidate });
  if (verdict.score >= threshold) return { passed: true, score: verdict.score };

  const missing = verdict.missing?.length ? ` missing: ${verdict.missing.join("; ")}` : "";
  return {
    passed: false,
    score: verdict.score,
    reason: `semantic: score ${verdict.score.toFixed(2)} < ${threshold} vs ${ref.corpus} ${ref.label}.${missing}`,
  };
}

/** Read + concatenate all source files under a dir subtree matching an extension set,
 *  each prefixed with its relative path (so the judge sees file boundaries). Skips
 *  node_modules / dist / __pycache__. Bounded so a runaway tree cannot blow the buffer:
 *  stops after maxBytes, appending a truncation marker. */
export function readTree(root: string, exts: string[], maxBytes = 200_000): string {
  if (!existsSync(root)) return "";
  const parts: string[] = [];
  let total = 0;
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir).sort()) {
      if (name === "node_modules" || name === "dist" || name === "__pycache__" || name === ".git") continue;
      const p = join(dir, name);
      const st = statSync(p);
      if (st.isDirectory()) {
        walk(p);
      } else if (exts.some((e) => name.endsWith(e))) {
        if (total >= maxBytes) return;
        const body = readFileSync(p, "utf8");
        const rel = p.slice(root.length + 1);
        const chunk = `// FILE: ${rel}\n${body}\n`;
        parts.push(chunk);
        total += chunk.length;
      }
    }
  };
  walk(root);
  const joined = parts.join("\n");
  return joined.length > maxBytes ? joined.slice(0, maxBytes) + "\n// ...[truncated]\n" : joined;
}

/** The recorded-build reference for a BUILD turn's output: the LAST recorded turn dir
 *  for the story under recorded-build (its terminal-good code tree), scoped to the
 *  role's output subtree , tests/ for a navigator (tests) turn, app/ for a driver
 *  (code) turn. Story matched POSITIONALLY (slugs differ across corpora), by the
 *  story's index in storyOrder, since the reference and candidate feature decompose
 *  the same way. Returns null when no recorded-build reference exists. */
export function resolveBuildReference(args: {
  kitRoot: string;
  featureId: string;
  storyIndex: number;
  kind: BuildOutputKind;
}): { paths: string[]; label: string; text: string } | null {
  const { kitRoot, featureId, storyIndex, kind } = args;
  // The recorded-build tree is .tdd-shaped (features/<F>/stories/...), so route its
  // paths through the sftdd-paths builders too (single-source layout rule). The
  // recorded-build root plays the `tdd` role; featureDir/storiesDir take it from there.
  const rbRoot = join(kitRoot, SCENARIOS_REL, CANONICAL, "recorded-build");
  const rbFeature = join(featureDir(rbRoot, featureId), "stories");
  if (!existsSync(rbFeature)) return null;
  const stories = readdirSync(rbFeature).filter((d) => statSync(join(rbFeature, d)).isDirectory()).sort();
  const story = stories[storyIndex];
  if (!story) return null;
  const turnsDir = join(rbFeature, story, "turns");
  if (!existsSync(turnsDir)) return null;
  const turns = readdirSync(turnsDir).filter((d) => statSync(join(turnsDir, d)).isDirectory()).sort();
  const lastTurn = turns[turns.length - 1];
  if (!lastTurn) return null;
  const codeRoot = join(turnsDir, lastTurn, "code");
  const sub = kind === "tests" ? join(codeRoot, "tests") : join(codeRoot, "app");
  if (!existsSync(sub)) return null;
  const text = readTree(sub, kind === "tests" ? [".py", ".tsx", ".ts"] : [".py"]);
  if (!text.trim()) return null;
  return { paths: [sub], label: `${CANONICAL} recorded-build/${story}/${lastTurn}/code/${kind === "tests" ? "tests" : "app"}`, text };
}

/** Read the candidate's BUILD output from the live experiment tree: tests/ (navigator)
 *  or app/ (driver), under the project dir (the experiment branch is checked out
 *  there). Returns "" when the subtree is absent. */
export function readCandidateBuildOutput(args: { projectDir: string; kind: BuildOutputKind }): string {
  const sub = join(args.projectDir, args.kind === "tests" ? "tests" : "app");
  return readTree(sub, args.kind === "tests" ? [".py", ".tsx", ".ts"] : [".py"]);
}

/** Evaluate a BUILD turn's produced output for FUNCTIONAL similarity to the recorded-
 *  build reference. This is Layer 2 (the Layer 1 honest-GREEN floor is the trial's own
 *  gate). Skips (passes) when no recorded-build reference exists. Below FUNCTIONAL_
 *  THRESHOLD => not viable, name the dropped/changed functionality. */
export async function evaluateBuildFunctionalGate(args: {
  kitRoot: string;
  projectDir: string;
  featureId: string;
  storyIndex: number;
  role: string;
  judge: SemanticJudge;
  threshold?: number;
}): Promise<SemanticGateOutcome> {
  const { kitRoot, projectDir, featureId, storyIndex, role, judge } = args;
  const threshold = args.threshold ?? FUNCTIONAL_THRESHOLD;
  const kind = buildOutputKind(role);
  if (!kind) return { passed: true, skipped: true }; // non build-authoring role

  const ref = resolveBuildReference({ kitRoot, featureId, storyIndex, kind });
  if (!ref) return { passed: true, skipped: true };

  const candidate = readCandidateBuildOutput({ projectDir, kind });
  if (!candidate.trim()) {
    return { passed: false, reason: `functional: candidate produced no ${kind} to compare against ${ref.label}` };
  }

  const verdict = await judge({ step: kind as unknown as TurnKey, reference: ref.text, candidate, functional: kind });

  // DISCRIMINATOR path: when the judge returned a classification (the build-code
  // discriminator, not the flat design similarity judge), the outcome is driven by
  // the CLASSIFICATION, not score>=threshold. A clean "equivalent"/accept is the BEST
  // outcome (the candidate converged with no self-heal needed) => PASS. superseded-shift
  // and driver-fixable regression are viable routings => PASS. Only "insufficient"
  // (unrecoverable / needs a human) FAILS. score is advisory here.
  const disc = verdict as Partial<DiscriminatorVerdict>;
  if (disc.classification) {
    const passed = disc.classification !== "insufficient";
    return {
      passed,
      score: verdict.score,
      classification: disc.classification,
      ...(disc.nextStep ? { nextStep: disc.nextStep } : {}),
      ...(disc.diagnosis ? { diagnosis: disc.diagnosis } : {}),
      ...(disc.fixDirective ? { fixDirective: disc.fixDirective } : {}),
      ...(passed
        ? {}
        : { reason: `discriminator: ${disc.classification} (${disc.nextStep ?? "escalate"}) vs ${ref.label}${disc.diagnosis ? ` , ${disc.diagnosis}` : ""}` }),
    };
  }

  // Legacy flat functional-similarity path (no classification): score>=threshold.
  if (verdict.score >= threshold) return { passed: true, score: verdict.score };
  const missing = verdict.missing?.length ? ` missing: ${verdict.missing.join("; ")}` : "";
  return {
    passed: false,
    score: verdict.score,
    reason: `functional: ${kind} score ${verdict.score.toFixed(2)} < ${threshold} vs ${ref.label}.${missing}`,
  };
}

/** Alignment of a navigator ASSESS turn's verdict against an independent oracle. */
export interface AssessAlignment {
  passed: boolean;
  classificationMatch: boolean;
  /** Jaccard overlap of the superseded-test sets (only meaningful for superseded-shift). */
  overlap: number;
  reason: string;
}

/** Parse the navigator's ASSESS marker files (in an AC cycle dir) into a discriminator-
 *  shaped verdict, so it can be diffed against the independent oracle. The markers:
 *   - superseded-tests.json {tests,reason}   => superseded-shift / permissive-refactor-superseded
 *   - regression-assessment.json {diagnosis, fixDirective?} => regression / driver-repair (fixable)
 *       or, WITHOUT fixDirective, insufficient / escalate (needs a human)
 *   - neither present => equivalent / accept (the navigator judged the code clean). */
export function parseNavigatorAssessMarker(markerDir: string): DiscriminatorVerdict {
  const sup = join(markerDir, "superseded-tests.json");
  const reg = join(markerDir, "regression-assessment.json");
  if (existsSync(sup)) {
    try {
      const j = JSON.parse(readFileSync(sup, "utf8")) as { tests?: unknown };
      const tests = Array.isArray(j.tests) ? j.tests.map(String) : [];
      return { score: 1, classification: "superseded-shift", nextStep: "permissive-refactor-superseded", supersededTests: tests };
    } catch {
      /* fall through */
    }
  }
  if (existsSync(reg)) {
    try {
      const j = JSON.parse(readFileSync(reg, "utf8")) as { diagnosis?: unknown; fixDirective?: unknown };
      const diagnosis = typeof j.diagnosis === "string" ? j.diagnosis : undefined;
      const fixDirective = typeof j.fixDirective === "string" && j.fixDirective ? j.fixDirective : undefined;
      return fixDirective
        ? { score: 1, classification: "regression", nextStep: "driver-repair-with-directive", ...(diagnosis ? { diagnosis } : {}), fixDirective }
        : { score: 1, classification: "insufficient", nextStep: "escalate", ...(diagnosis ? { diagnosis } : {}) };
    } catch {
      /* fall through */
    }
  }
  // No marker written => the navigator judged the driver's code clean.
  return { score: 1, classification: "equivalent", nextStep: "accept" };
}

/** Evaluate whether the navigator's ASSESS verdict ALIGNS with an independent opus
 *  oracle's read of the SAME driver code. This measures whether the navigator did its
 *  evaluation job WELL (not just produced a conformant artifact). PASS iff the
 *  classifications match AND, for a superseded-shift, the flagged-test sets overlap
 *  (Jaccard >= 0.5); FAIL on any misclassification (e.g. a real regression called
 *  "superseded", or real coverage flagged as superseded). */
export function evaluateNavigatorAssessAlignment(args: {
  oracleVerdict: DiscriminatorVerdict;
  navigatorMarkerDir: string;
}): AssessAlignment {
  const nav = parseNavigatorAssessMarker(args.navigatorMarkerDir);
  const oracle = args.oracleVerdict;
  const classificationMatch = nav.classification === oracle.classification;
  if (!classificationMatch) {
    return {
      passed: false,
      classificationMatch: false,
      overlap: 0,
      reason: `misclassification: navigator said "${nav.classification}" (${nav.nextStep}), oracle said "${oracle.classification}" (${oracle.nextStep})`,
    };
  }
  // Classifications agree. For superseded-shift, the flagged test sets must overlap.
  if (nav.classification === "superseded-shift") {
    const a = new Set(nav.supersededTests ?? []);
    const b = new Set(oracle.supersededTests ?? []);
    const inter = [...a].filter((t) => b.has(t)).length;
    const union = new Set([...a, ...b]).size;
    const overlap = union === 0 ? 1 : inter / union;
    return {
      passed: overlap >= 0.5,
      classificationMatch: true,
      overlap,
      reason: overlap >= 0.5 ? `aligned: superseded sets overlap ${overlap.toFixed(2)}` : `superseded sets diverge (Jaccard ${overlap.toFixed(2)} < 0.5)`,
    };
  }
  // equivalent / regression / insufficient: classification match is sufficient alignment.
  return { passed: true, classificationMatch: true, overlap: 1, reason: `aligned: both "${nav.classification}"` };
}

/** Build the judge prompt: ask a FIXED model whether the candidate artifact conveys
 *  the SAME design/behavior as the recorded reference at this step. Meaning, not
 *  wording/slug/split. Demands a strict JSON verdict so the score is machine-read. */
export function buildJudgePrompt(step: TurnKey, reference: string, candidate: string): string {
  return [
    `You are a strict design reviewer scoring SEMANTIC similarity for a "${step}" design-step artifact.`,
    `The REFERENCE is a known-good artifact recorded at this step. The CANDIDATE is a newly produced artifact for the same step.`,
    `Judge whether the CANDIDATE conveys the SAME design intent and behavioral coverage as the REFERENCE.`,
    `Judge MEANING, not wording: different phrasing, different ids/slugs, or a different split of the same content across sections is FINE.`,
    `What matters: every material behavior, entity, component, decision, or constraint the REFERENCE expresses is present (equivalently) in the CANDIDATE. Extra content in the CANDIDATE is fine and not penalized.`,
    `Return ONLY a JSON object on a single line: {"score": <0..1 float>, "missing": ["<material intent the CANDIDATE dropped>", ...]}. score 1.0 = full semantic coverage; lower as material intent is missing. missing lists ONLY dropped items (empty array when none).`,
    ``,
    `REFERENCE:`,
    "```json",
    reference,
    "```",
    ``,
    `CANDIDATE:`,
    "```json",
    candidate,
    "```",
  ].join("\n");
}

/** Build the FUNCTIONAL-similarity judge prompt for a BUILD turn's output (code or
 *  tests). Unlike the design prompt (same intent), this asks for FUNCTIONAL
 *  equivalence: same behaviors tested / same functionality implemented / same layer
 *  responsibilities , explicitly ignoring naming, formatting, and structural
 *  arrangement (code varies more than prose, hence the looser bar). */
export function buildFunctionalJudgePrompt(kind: BuildOutputKind, reference: string, candidate: string): string {
  const what =
    kind === "tests"
      ? `These are TEST files. Judge whether the CANDIDATE tests assert the SAME behaviors / acceptance criteria as the REFERENCE tests , the same things are verified (endpoints, validations, persistence invariants, edge/empty cases, migration reversibility).`
      : `These are CODE files. Judge whether the CANDIDATE code implements the SAME functionality as the REFERENCE , the same operations/endpoints, the same layer responsibilities (boundary/route, service, repository, model), the same persistence behavior.`;
  return [
    `You are a strict senior engineer scoring FUNCTIONAL similarity of ${kind} produced for one build turn.`,
    `The REFERENCE is the known-good ${kind} recorded for this story in a prior build. The CANDIDATE is newly produced ${kind} for the same story.`,
    what,
    `Judge FUNCTION, not form: different file names, symbol names, ordering, formatting, or a different structural split of the SAME behavior/functionality is FINE and must NOT lower the score. Only MISSING or CHANGED behavior/functionality lowers it. Extra behavior in the CANDIDATE is fine and not penalized.`,
    `Return ONLY a JSON object on a single line: {"score": <0..1 float>, "missing": ["<behavior/functionality the CANDIDATE dropped or changed>", ...]}. score 1.0 = full functional coverage; lower as material behavior/functionality is missing or altered. missing lists ONLY dropped/changed items (empty array when none).`,
    ``,
    `REFERENCE ${kind}:`,
    "```",
    reference,
    "```",
    ``,
    `CANDIDATE ${kind}:`,
    "```",
    candidate,
    "```",
  ].join("\n");
}

/** Build the DISCRIMINATOR prompt for a build turn's code/tests. Unlike the flat
 *  functional-similarity prompt (which returns only a score), this mirrors the
 *  navigator ASSESS turn: the judge must CLASSIFY the candidate and name the NEXT STEP
 *  it warrants. Crucially, a CLEAN verdict (equivalent/accept , the candidate needs no
 *  refactor and introduced no regression) is the BEST possible result , the candidate
 *  converged cleaner than the recorded baseline that needed the assess->repair spiral ,
 *  and must score HIGH, never be treated as a miss. */
export function buildDiscriminatorPrompt(kind: BuildOutputKind, reference: string, candidate: string): string {
  const what =
    kind === "tests"
      ? `These are TEST files a navigator authored. The REFERENCE is the known-good tests recorded for this story.`
      : `These are CODE files a driver produced. The REFERENCE is the known-good code recorded for this story (after its full self-heal).`;
  return [
    `You are a strict senior engineer acting as an independent DISCRIMINATOR over ${kind} produced for one build turn, mirroring what a Navigator does when it ASSESSES a build.`,
    what,
    `Judge FUNCTION, not form: different file/symbol names, ordering, formatting, or a different structural split of the SAME behavior is FINE and must NOT lower the verdict.`,
    ``,
    `CLASSIFY the CANDIDATE into exactly one:`,
    `  - "equivalent"      : the candidate implements/asserts the same functionality with NO gap and NO regression. This is the BEST, IDEAL outcome , the candidate is done and needs no follow-up (it converged cleaner / better than the reference, which may have needed extra repair turns). Score it HIGH (>= 0.9).`,
    `  - "superseded-shift": the candidate legitimately CHANGES behavior the reference/prior tests encode (the latest requirement wins), so some PRIOR tests are now superseded and should be permissively refactored , NOT a bug.`,
    `  - "regression"      : the candidate is genuinely WRONG (missing/broken functionality the requirement needs). If a driver could fix it, provide a concrete fixDirective; the diagnosis states the root cause.`,
    `  - "insufficient"    : the candidate is unrecoverable or the problem needs a human / a design or spec change (NO safe driver fix). This is the ONLY failing verdict.`,
    ``,
    `Then name the NEXT STEP: "accept" (equivalent), "permissive-refactor-superseded" (superseded-shift), "driver-repair-with-directive" (fixable regression), or "escalate" (insufficient).`,
    ``,
    `Return ONLY a JSON object on a single line: {"score": <0..1>, "classification": "<one of the four>", "nextStep": "<one of the four>", "missing": ["<dropped/changed behavior>", ...], "diagnosis": "<root cause, regression only>", "fixDirective": "<what a driver should change, fixable regression only>", "supersededTests": ["<prior test path>", ...]}. Omit diagnosis/fixDirective/supersededTests when not applicable. A clean "equivalent" verdict with empty missing is the best answer , do NOT invent problems.`,
    ``,
    `REFERENCE ${kind}:`,
    "```",
    reference,
    "```",
    ``,
    `CANDIDATE ${kind}:`,
    "```",
    candidate,
    "```",
  ].join("\n");
}

/** Build the RED coverage+faithfulness judge prompt: judge a navigator's authored
 *  tests against the TEST-LIST SPEC (+ the story's ACs), NOT turn-for-turn against
 *  recorded tests. Two dimensions: (coverage) every test-list item / AC is covered by
 *  a test; (faithfulness) each test actually asserts the requirement its item
 *  describes (right behavior/invariant, owns its DB state). The bar is the SPEC. */
export function buildRedCoverageJudgePrompt(testListJson: string, acsJson: string, candidateTests: string): string {
  return [
    `You are a strict senior engineer scoring a Navigator's authored RED tests against the TEST-LIST SPEC for a story , NOT against any recorded tests. The bar is the SPEC: do these tests correctly encode what the test list + acceptance criteria require?`,
    `Judge two things:`,
    `  (1) COVERAGE , every item in the test list (and every acceptance criterion) is covered by at least one produced test.`,
    `  (2) FAITHFULNESS , each test actually ASSERTS the requirement its test-list item describes (the right behavior / invariant / edge case), and any DB-writing test owns its own state (a per-run-unique key), not a shared/absolute whole-table assertion.`,
    `Judge FUNCTION, not form: test/file/symbol names, ordering, and structure are irrelevant , only whether the requirements are covered + faithfully asserted.`,
    `Return ONLY a JSON object on a single line: {"score": <0..1>, "missing": ["<test-list item or AC that is uncovered OR unfaithfully asserted>", ...]}. score 1.0 = every item covered + faithful; lower as items are missing or wrongly asserted. missing lists ONLY the gaps (empty array when none).`,
    ``,
    `TEST LIST (the spec):`,
    "```json",
    testListJson,
    "```",
    ``,
    `ACCEPTANCE CRITERIA:`,
    "```json",
    acsJson,
    "```",
    ``,
    `CANDIDATE TESTS:`,
    "```",
    candidateTests,
    "```",
  ].join("\n");
}

/** The valid discriminator classifications + next steps (for parse validation). */
const BUILD_CLASSIFICATIONS = new Set<BuildClassification>(["equivalent", "superseded-shift", "regression", "insufficient"]);
const BUILD_NEXT_STEPS = new Set<BuildNextStep>(["accept", "permissive-refactor-superseded", "driver-repair-with-directive", "escalate"]);

/** Parse a DISCRIMINATOR reply into a classified verdict. Tolerant like parseJudgeReply,
 *  but an UNPARSEABLE reply OR an unknown classification defaults to
 *  insufficient/escalate (fail-safe: a judge that cannot classify must NOT pass the
 *  candidate , the same posture as score 0 on the flat judge). */
export function parseDiscriminatorReply(reply: string): DiscriminatorVerdict {
  const base = parseJudgeReply(reply);
  const m = reply.match(/\{[\s\S]*"classification"[\s\S]*\}/);
  const fail: DiscriminatorVerdict = { ...base, classification: "insufficient", nextStep: "escalate" };
  if (!m) return fail;
  try {
    const obj = JSON.parse(m[0]) as {
      classification?: unknown;
      nextStep?: unknown;
      diagnosis?: unknown;
      fixDirective?: unknown;
      supersededTests?: unknown;
    };
    const classification = obj.classification as BuildClassification;
    if (!BUILD_CLASSIFICATIONS.has(classification)) return fail;
    const nextStep = BUILD_NEXT_STEPS.has(obj.nextStep as BuildNextStep) ? (obj.nextStep as BuildNextStep) : defaultNextStep(classification);
    return {
      ...base,
      classification,
      nextStep,
      ...(typeof obj.diagnosis === "string" ? { diagnosis: obj.diagnosis } : {}),
      ...(typeof obj.fixDirective === "string" && obj.fixDirective ? { fixDirective: obj.fixDirective } : {}),
      ...(Array.isArray(obj.supersededTests) ? { supersededTests: obj.supersededTests.map(String) } : {}),
    };
  } catch {
    return fail;
  }
}

/** The next step a classification implies when the judge omitted/garbled it. */
function defaultNextStep(c: BuildClassification): BuildNextStep {
  switch (c) {
    case "equivalent":
      return "accept";
    case "superseded-shift":
      return "permissive-refactor-superseded";
    case "regression":
      return "driver-repair-with-directive";
    default:
      return "escalate";
  }
}

/** Parse the judge's reply into a verdict. Tolerant: extracts the first JSON object
 *  with a numeric `score`. A reply without a parseable score is treated as score 0
 *  (a judge that could not answer must not silently pass the candidate). */
export function parseJudgeReply(reply: string): SemanticVerdict {
  const m = reply.match(/\{[\s\S]*?"score"[\s\S]*?\}/);
  if (m) {
    try {
      const obj = JSON.parse(m[0]) as { score?: unknown; missing?: unknown };
      const score = typeof obj.score === "number" ? Math.max(0, Math.min(1, obj.score)) : 0;
      const missing = Array.isArray(obj.missing) ? obj.missing.map(String) : undefined;
      return { score, missing, raw: reply };
    } catch {
      /* fall through */
    }
  }
  return { score: 0, missing: ["judge reply not parseable as a score"], raw: reply };
}

/** The REAL judge: a fixed-model `claude -p` (opus by default), constant across
 *  candidates so the bar never moves with the thing being measured. Uses
 *  --output-format json + --strict-mcp-config + acceptEdits (no writes needed, but
 *  consistent with the drive's headless posture). Reads the assistant text from the
 *  json result and parses the verdict. cwd is the project dir. */
export function makeOpusJudge(opts: { cwd: string; model?: string }): SemanticJudge {
  const model = opts.model ?? "opus";
  return ({ step, reference, candidate, functional }) =>
    new Promise<SemanticVerdict>((resolve) => {
      // A build-output comparison uses the FUNCTIONAL-equivalence prompt (looser, code/
      // tests); a design artifact uses the semantic-intent prompt.
      const prompt = functional
        ? buildFunctionalJudgePrompt(functional, reference, candidate)
        : buildJudgePrompt(step, reference, candidate);
      execFile(
        "claude",
        ["-p", prompt, "--model", model, "--permission-mode", "acceptEdits", "--strict-mcp-config", "--output-format", "json"],
        { cwd: opts.cwd, maxBuffer: 32 * 1024 * 1024, timeout: 5 * 60_000 },
        (err, stdout) => {
          if (err && !stdout) {
            // A judge that could not run must not silently pass the candidate.
            resolve({ score: 0, missing: [`judge spawn failed: ${err.message}`] });
            return;
          }
          // claude -p --output-format json wraps the reply in { result: "<text>" }.
          let text = stdout;
          try {
            const parsed = JSON.parse(stdout) as { result?: string };
            if (typeof parsed.result === "string") text = parsed.result;
          } catch {
            /* stdout was not the json envelope; parse it directly */
          }
          resolve(parseJudgeReply(text));
        },
      );
    });
}

/** Spawn the FIXED-opus judge on a prepared prompt and parse the reply with `parse`.
 *  Shared by the discriminator + design judges. opus is HARDCODED for the
 *  discriminator (the bar must not move with the thing being measured); a spawn
 *  failure resolves via `onFail` (fail-safe: never silently pass). */
function spawnOpusJudge<T>(cwd: string, prompt: string, parse: (text: string) => T, onFail: (msg: string) => T): Promise<T> {
  return new Promise<T>((resolve) => {
    execFile(
      "claude",
      ["-p", prompt, "--model", "opus", "--permission-mode", "acceptEdits", "--strict-mcp-config", "--output-format", "json"],
      { cwd, maxBuffer: 32 * 1024 * 1024, timeout: 5 * 60_000 },
      (err, stdout) => {
        if (err && !stdout) {
          resolve(onFail(`judge spawn failed: ${err.message}`));
          return;
        }
        let text = stdout;
        try {
          const parsed = JSON.parse(stdout) as { result?: string };
          if (typeof parsed.result === "string") text = parsed.result;
        } catch {
          /* stdout was not the json envelope; parse it directly */
        }
        resolve(parse(text));
      },
    );
  });
}

/** The build-code DISCRIMINATOR judge: a FIXED-opus `claude -p` (model NON-overridable,
 *  by design , the discriminator is the constant bar an assess turn's judgment is
 *  measured against + the independent oracle the navigator-assess alignment check
 *  reuses, so its model must never vary). Given the reference + candidate build output,
 *  returns a classified DiscriminatorVerdict (classification + next step). An
 *  unparseable / failed judge resolves to insufficient/escalate (fail-safe). */
export function makeBuildDiscriminatorJudge(opts: { cwd: string }): (args: { kind: BuildOutputKind; reference: string; candidate: string }) => Promise<DiscriminatorVerdict> {
  return ({ kind, reference, candidate }) =>
    spawnOpusJudge(
      opts.cwd,
      buildDiscriminatorPrompt(kind, reference, candidate),
      parseDiscriminatorReply,
      (msg) => ({ score: 0, missing: [msg], classification: "insufficient", nextStep: "escalate" }),
    );
}
