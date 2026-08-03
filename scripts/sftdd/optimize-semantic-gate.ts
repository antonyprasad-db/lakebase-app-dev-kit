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
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { TurnKey } from "./sftdd-config.js";
import { designGuideJson, featureSpecJson, architectureJson, featureTestListJson, dbDesignJson, acsDir, storiesDir } from "./sftdd-paths.js";

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
    case "architect":
    case "estimate":
      return architectureJson(base, featureId);
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

/** Threshold on the judge's 0..1 semantic-coverage score. At/above => comparable. */
export const SEMANTIC_THRESHOLD = 0.85;

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

/** Injected LLM-as-judge: given the reference + candidate artifact text for a step,
 *  return a semantic-coverage verdict. Real impl spawns a FIXED opus `claude -p`
 *  (constant across candidates); stubbable for hermetic tests. */
export type SemanticJudge = (args: {
  step: TurnKey;
  reference: string;
  candidate: string;
}) => Promise<SemanticVerdict>;

export interface SemanticGateOutcome {
  /** true = comparable (>= threshold) OR no reference exists (bar not applicable). */
  passed: boolean;
  /** The judged score, when a judgment was made (undefined when skipped). */
  score?: number;
  reason?: string;
  /** true when there was no recorded reference for this step -> bar skipped. */
  skipped?: boolean;
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
  return ({ step, reference, candidate }) =>
    new Promise<SemanticVerdict>((resolve) => {
      const prompt = buildJudgePrompt(step, reference, candidate);
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
