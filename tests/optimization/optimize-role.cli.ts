#!/usr/bin/env node
// optimize-role: the per-CHAIN lever sweep CLI , INTERNAL agent performance-tuning tooling (NOT a
// published bin; it lives under tests/optimization/ and is invoked via scripts/optimize-role.sh).
// It sweeps one or MANY manifest turn-chains: each chain runs its isolated chain (recorded inputs
// replayed in, only that role's turn live) once per candidate lever patch (model tiers x effort
// rungs x scan-tight), gates each on the role's conformance validator + a reference-example quality
// judge, and reports the fastest quality-holding candidate vs the baseline. Every chain is measured
// STANDALONE against its recorded reference , so chains AND candidates fan out in parallel with zero
// shared mutable state (each candidate's runIntegrationChain mkdtemps its own workspace; levers ride
// in-memory on the ClaudeStepAgent). This is the lightweight sibling of consort-optimize; it needs
// NO cloud project (the design + navigator tiers), only the isolation substrate + recorded corpus.
//
//   scripts/optimize-role.sh --chains design [--concurrency 3] [--base-model sonnet] [--telemetry-dir DIR]
//   scripts/optimize-role.sh --chains spec-author-story,architect-reviewer [--concurrency 4]
//   scripts/optimize-role.sh --role test-strategist            # back-compat: single chain
//
// --chains is a SET: "design" (every design role chain), or a comma list of chain handles. --role is
//   the back-compat single-chain alias. --concurrency caps in-flight candidates ACROSS the whole run
//   (1 = sequential, the prior behavior). --base-model overrides the per-chain recorded default.
//   Each candidate's telemetry + produced artifacts survive to <telemetry-dir>/<chain>/<candidate>/.
//
// LIVE + LEAN: every candidate is a real `claude -p` turn, tool-scoped out of Bash, reporting via
// the agent-report channel, in a throwaway .sftdd workspace , nothing to tear down.

import { isCliEntry } from "@databricks-solutions/lakebase-scm-utils/util";
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, relative } from "node:path";
import { ROLE_CHAINS, runRoleChainLive, INTAKE_REL, type RoleChain } from "../../consort/optimize/role-chains.js";
import { BUILD_ROLE_CHAINS, runBuildRoleChainLive, BUILD_CORPUS_REL, type BuildRoleChain } from "../../consort/optimize/build-role-chains.js";
import { roleCandidates, testStrategistCandidates } from "./role-levers.js";
import { runRoleSweep, type SweepTrial, type ChainRunner, type QualityGate, type QualityVerdict, type SweepableChain } from "./role-sweep.js";
import { reportRoleSweep, formatRoleSweepReport, type SweepReport } from "./role-sweep-report.js";
import { scaffoldDriverGreenProject, teardownDriverGreenProject, runDriverGreenOnScaffold, sweepDriverGreenOrphans, type RunDriverGreenResult } from "../integration/live/driver-build-support.js";
import { makeOpusJudge, makeVerdictAlignmentJudge, parseVerdictFile, makeBuildDiscriminatorJudge, parseNavigatorAssessMarker, makeSupersessionDeltaJudge, evaluateNavigatorAssessAlignment, evaluateNextStepDetermination, FUNCTIONAL_THRESHOLD, SEMANTIC_THRESHOLD, type BuildOutputKind, type VerdictOutput } from "../../consort/evaluation/semantic-gate.js";
import { enabledAnalysts } from "../../consort/test-list/test-analyst-catalogue.js";
import { RECOMMENDED_MODELS, type SpawnableAgentRole } from "../../consort/config/agent-models.js";
import type { StepManifest } from "../../consort/orchestrator/steps/manifest.js";
import type { StepAgent } from "../../consort/orchestrator/agents/agent-types.js";
import { snapshotTree } from "../../consort/orchestrator/scenarios/integration-chain.js";

/** A driver turn the sweep can exercise, and the CONTAINED next-step navigator determination it is
 *  judged against. `evaluatorKind` picks the directional comparison (assess for green/repair, review
 *  for refactor); `refRel` is the camp-relative dir holding the recorded determination (copied into
 *  consort/evaluation/reference-assets/stockflow/next-step/ , the corpus is assumed deleted). */
export interface DriverTurnSpec {
  driverTurn: "green" | "repair" | "refactor";
  evaluatorKind: "assess" | "review";
  /** Camp-relative dir (under BUILD_CORPUS_REL) with the recorded next-step determination. */
  refRel: string;
}
export const DRIVER_TURN_SPECS: Record<string, DriverTurnSpec> = {
  "driver-green": { driverTurn: "green", evaluatorKind: "assess", refRel: "next-step/driver-green" },
  "driver-repair": { driverTurn: "repair", evaluatorKind: "assess", refRel: "next-step/driver-repair" },
  "driver-refactor": { driverTurn: "refactor", evaluatorKind: "review", refRel: "next-step/driver-refactor" },
};

/** The chain SET keywords that expand to a group of handles. "design" = every design role chain
 *  (the lean, no-cloud tier); "navigator" = navigator build chains (red/assess/review/reflect);
 *  "driver" = driver LIVE lever sweeps (requires RUN_LIVE_STEP + LAKEBASE_TEST_E2E). */
const CHAIN_SETS: Record<string, string[]> = {
  design: Object.keys(ROLE_CHAINS),
  navigator: Object.keys(BUILD_ROLE_CHAINS),
  driver: Object.keys(DRIVER_TURN_SPECS), // driver-green, driver-repair, driver-refactor
};

/** Combined universe of all chains (design + build + driver). Used for validation. The driver handles
 *  (driver-green/-repair/-refactor) are synthetic , they route to sweepDriverGreen (the ONE sweep engine),
 *  each seeded to its own flagged pre-turn state + judged by its next-step navigator determination. */
function allChains(): Record<string, RoleChain | BuildRoleChain | { id: string }> {
  const driver = Object.fromEntries(Object.keys(DRIVER_TURN_SPECS).map((h) => [h, { id: h }]));
  return { ...ROLE_CHAINS, ...BUILD_ROLE_CHAINS, ...driver };
}

/** Expand a --chains spec (a set keyword OR a comma list of handles) into concrete chain handles,
 *  validated against ROLE_CHAINS + BUILD_ROLE_CHAINS + synthetic handles (driver-green). Pure + exported for a unit test.
 *  De-dupes while preserving order. */
export function expandChains(spec: string, chains: Record<string, unknown> = allChains()): string[] {
  const raw = CHAIN_SETS[spec] ?? spec.split(",").map((s) => s.trim()).filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const h of raw) {
    if (!chains[h]) {
      throw new Error(`optimize-role: unknown chain "${h}". Sets: ${Object.keys(CHAIN_SETS).join(", ")}. Handles: ${Object.keys(chains).join(", ")}`);
    }
    if (!seen.has(h)) { seen.add(h); out.push(h); }
  }
  if (out.length === 0) throw new Error(`optimize-role: --chains "${spec}" expanded to nothing`);
  return out;
}

/** Parsed CLI args. `chains` is the resolved handle list (one or many). */
export interface OptimizeRoleArgs {
  chains: string[];
  baseModel?: string;
  telemetryDir?: string;
  concurrency?: number;
  /** Optional candidate-id subset (comma list). When set, only these candidates run , used to
   *  RESUME a partial driver-green sweep (run just the ones a crash didn't complete). Their trials
   *  MERGE with any per-candidate trials already persisted under the run dir, so the rollup covers
   *  the full set. Absent => every candidate runs. */
  candidates?: string[];
}

/** Parse argv (pure + exported for a unit test). Accepts --chains <set|list> OR the back-compat
 *  single --role <handle>. Throws loud on an unknown/absent chain. */
export function parseArgs(argv: string[], chains: Record<string, unknown> = allChains()): OptimizeRoleArgs {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined;
  };
  const chainsSpec = get("--chains");
  const role = get("--role");
  if (!chainsSpec && !role) {
    throw new Error(`optimize-role: --chains <set|list> (or --role <handle>) is required. Sets: ${Object.keys(CHAIN_SETS).join(", ")}. Handles: ${Object.keys(chains).join(", ")}`);
  }
  const resolved = chainsSpec ? expandChains(chainsSpec, chains) : expandChains(role!, chains);
  const conc = get("--concurrency");
  const cands = get("--candidates");
  return {
    chains: resolved,
    ...(get("--base-model") ? { baseModel: get("--base-model") } : {}),
    ...(get("--telemetry-dir") ? { telemetryDir: get("--telemetry-dir") } : {}),
    ...(conc !== undefined ? { concurrency: Math.max(1, Number(conc) || 1) } : {}),
    ...(cands ? { candidates: cands.split(",").map((s) => s.trim()).filter(Boolean) } : {}),
  };
}

/** The role's baseline model: the CLI override, else RECOMMENDED_MODELS, else sonnet. */
function baseModelFor(role: string, override?: string): string {
  if (override) return override;
  // The chain handle is the spawnable role for the design roles; the plan-lane handles
  // (spec-author-propose -> spec-author, architect-estimator -> architect-reviewer) map to their
  // spawnable role for the recommended-model lookup.
  const spawnable: Record<string, SpawnableAgentRole> = {
    "spec-author-story": "spec-author",
    "spec-author-propose": "spec-author",
    "architect-reviewer": "architect-reviewer",
    "architect-estimator": "architect-reviewer",
    dba: "dba",
    "test-strategist": "test-strategist",
  };
  const r = spawnable[role];
  return (r && RECOMMENDED_MODELS[r]) || "sonnet";
}

/** The driver-green sweep: a CLOUD LIVE run (requires RUN_LIVE_STEP + LAKEBASE_TEST_E2E to be set).
 *  Each candidate runs a FULL driver-GREEN cycle with the levers patched, gates on honest-GREEN, is
 *  JUDGED (code discriminator vs the 003-driver pin), and PRESERVED , all via the ONE sweep engine. */

/** Resolve which candidates a driver-green run executes: all of them, or the named subset (a resume of a
 *  partial sweep). Throws loud on an unknown id BEFORE any scaffold is spun up , a typo in a resume must
 *  not burn a live scaffold. Pure + exported for a unit test. */
export function selectDriverCandidates<C extends { id: string }>(all: C[], subset?: string[]): C[] {
  if (!subset?.length) return all;
  const missing = subset.filter((id) => !all.some((c) => c.id === id));
  if (missing.length) {
    throw new Error(`optimize-role: unknown driver-green candidate(s): ${missing.join(", ")}. Known: ${all.map((c) => c.id).join(", ")}`);
  }
  return all.filter((c) => subset.includes(c.id));
}

export async function sweepDriverGreen(
  handle: string,
  runRoot: string,
  opts: { concurrency?: number; candidates?: string[] } = {},
): Promise<{ summary: ChainSummary }> {
  // GATED: only meaningful with a live test env (RUN_LIVE_STEP + LAKEBASE_TEST_E2E).
  if (!process.env.RUN_LIVE_STEP || !process.env.LAKEBASE_TEST_E2E) {
    throw new Error(
      `optimize-role: driver sweep requires RUN_LIVE_STEP=1 LAKEBASE_TEST_E2E=1 (live cloud gate). ` +
        `This is a LIVE driver harness, not a lean chain run. Use the driver-build-support harness directly or set the gates.`,
    );
  }
  const spec = DRIVER_TURN_SPECS[handle];
  if (!spec) throw new Error(`optimize-role: unknown driver handle "${handle}" (known: ${Object.keys(DRIVER_TURN_SPECS).join(", ")})`);

  const runDir = join(runRoot, handle);
  mkdirSync(runDir, { recursive: true });

  // Candidate subset (resume a partial sweep): run only the named ids; their trials MERGE with any
  // per-candidate dirs already persisted from a prior (crashed) run in the SAME run dir. Absent => all.
  const all = roleCandidates("sonnet");
  const candidates = selectDriverCandidates(all, opts.candidates);

  // eslint-disable-next-line no-console
  console.log(`[optimize-role] ${handle}: CLOUD LIVE driver-GREEN sweep, ${candidates.length} candidate(s)${opts.candidates?.length ? ` (subset: ${opts.candidates.join(",")})` : ""}, concurrency=${opts.concurrency ?? 1}. run dir: ${runDir}`);

  // The MANDATORY driver-turn judge (SHARED with the re-judge harness , buildDriverNextStepJudge): run
  // the candidate's NEXT-STEP navigator determination through evaluateNextStepDetermination vs the
  // CONTAINED recorded determination. PASS / PASS-WITH-HONORS (flagged, better) / FAIL.
  const quality: QualityGate = buildDriverNextStepJudge(handle);

  // The driver chain as a ChainRunner for the ONE sweep engine: scaffold ONCE (the #589 model), each
  // candidate cuts its own worktree + Lakebase branch off it, drives its DRIVER TURN + the live
  // next-step navigator eval (opus-high), and returns producedArtifacts (app/+tests) MERGED with the
  // captured next-step marker (under NEXT_STEP_MARKER_PREFIX) + gate:{honestGreen}. runRoleSweep then
  // PRESERVES + JUDGES it identically to every other chain (no second engine).
  const project = await scaffoldDriverGreenProject();
  const driverChain: SweepableChain = { dir: handle, outputFile: "app", prompt: `driver ${spec.driverTurn} (live, shared scaffold)` };
  const runChain: ChainRunner = async (_c, _agentFor, candidateId, levers) => {
    const result = await runDriverGreenOnScaffold(project, {
      experimentSlug: `s3-${spec.driverTurn}-${candidateId}`,
      branch: `experiment/S3-${spec.driverTurn}-${candidateId}`,
      driverTurn: spec.driverTurn,
      ...(Object.keys(levers).length ? { leverOverride: levers } : {}),
    }) as RunDriverGreenResult | undefined;
    if (!result) throw new Error(`runDriverGreenOnScaffold returned void (expected RunDriverGreenResult)`);
    // Merge the captured next-step navigator marker into producedArtifacts under the reserved prefix so
    // the judge reads it without widening the ChainRunResult seam; the app/+tests stay for preservation.
    const producedArtifacts: Record<string, string> = { ...result.producedArtifacts };
    for (const [k, v] of Object.entries(result.nextStepMarker)) producedArtifacts[`${NEXT_STEP_MARKER_PREFIX}${k.split("/").pop()}`] = v;
    // turns:[] (the driver's work is a full GREEN cycle, not a single ManifestTurn), so hand the harness's
    // measured wall-clock explicitly , without it every candidate reads 0ms and the winner can't be ranked.
    return { turns: [], producedArtifacts, gate: { passed: result.honestGreen }, durationMs: result.durationMs };
  };

  let trials: SweepTrial[];
  try {
    trials = await runRoleSweep(driverChain, candidates, runChain, {
      ...(opts.concurrency ? { concurrency: opts.concurrency } : {}),
      quality,
      onStart: (candidate, i, total) => {
        // eslint-disable-next-line no-console
        console.log(`[optimize-role] ${handle} (${i}/${total}) running ${candidate.id} ...`);
      },
      onDone: (trial, i, total) => {
        // PRESERVE every candidate's produced code + verdict the instant it finishes (crash-resilient).
        persistTrial(runDir, driverChain as unknown as RoleChain, "sonnet", trial);
        const q = trial.qualityPassed === undefined ? "" : trial.qualityPassed ? ` judge PASSED (${trial.telemetry?.classification ?? "?"})` : ` judge FAILED (${trial.telemetry?.classification ?? "?"})`;
        const status = trial.disqualified ? `DISQUALIFIED (${trial.reason})` : trial.gatePassed ? "honest-GREEN" : "not-green";
        // eslint-disable-next-line no-console
        console.log(`[optimize-role] ${handle} (${i}/${total}) ${trial.candidateId}: ${status}${q}${trial.telemetry?.outerDurationMs ? ` , ${(trial.telemetry.outerDurationMs / 1000).toFixed(1)}s` : ""}`);
      },
    });
  } finally {
    await teardownDriverGreenProject(project);
    // Orphan backstop (a killed candidate can leak a Lakebase project despite per-candidate teardown).
    await sweepDriverGreenOrphans();
  }

  // Winner via the SHARED report: the fastest candidate that passed BOTH conformance (honest-GREEN)
  // AND the mandatory judge , NOT wall-clock among honest-GREEN (the prior, judge-less bug).
  const report = reportRoleSweep(trials);
  writeFileSync(join(runDir, "report.txt"), formatRoleSweepReport(report) + "\n");
  const summary = buildChainSummary(handle, "sonnet", trials, report);
  writeFileSync(join(runDir, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
  // eslint-disable-next-line no-console
  console.log(`\n[${handle}]\n` + formatRoleSweepReport(report));

  return { summary };
}

/** Read a required recorded reference from the CAMP; throw loud if absent (the evaluation cannot
 *  run without its reference , never a silent skip). */
function readCampReference(relFromCorpusRoot: string, what: string): string {
  const p = join(process.cwd(), BUILD_CORPUS_REL, relFromCorpusRoot);
  if (!existsSync(p)) {
    throw new Error(`optimize-role: MISSING recorded reference for ${what} at ${p} , the LLM judge is mandatory and cannot run without it. Extract it from the corpus into the camp first.`);
  }
  return readFileSync(p, "utf8");
}

/** The camp-relative path to the recorded driver-GREEN code pin (003-driver's app/ DIRECTORY). The
 *  driver-green sweep judges every candidate's produced app/ against this. Exported so a hermetic
 *  test can assert it resolves to non-empty concatenated .py text (guards the dir-vs-file EISDIR
 *  the live path hit: readFileSync on this directory throws, so it MUST go through readCampAppDir). */
export const DRIVER_GREEN_CODE_PIN_REL =
  "recorded-build/features/F6-split-tracking-code/stories/S1-split-columns-migration/turns/003-driver/code/app";

/** producedArtifacts key-prefix carrying the candidate's NEXT-STEP NAVIGATOR EVALUATION marker files
 *  (superseded-tests.json / regression-assessment.json / review-verdict.json, relpath -> contents) from
 *  the harness. It rides producedArtifacts so (a) the judge closure reads it without widening the
 *  ChainRunResult seam, and (b) persistTrial DURABLY stores it per candidate at
 *  `<runDir>/<candidate>/artifacts/navigator-eval/<file>` , a first-class, legibly-named record of the
 *  navigator's evaluation of this driver output. That stored evaluation is a REUSABLE SAMPLE for a
 *  separate test OF THE NAVIGATOR itself (how the navigator assessed/reviewed each driver candidate),
 *  so the prefix is a real path segment, not an opaque marker. */
const NEXT_STEP_MARKER_PREFIX = "navigator-eval/";

/** Concatenate the produced files under `prefix` with a matching extension into ONE deterministic text
 *  (sorted by relpath). Used to reconstruct the judged text when a chain's outputFile is a DIRECTORY
 *  (navigator-red's "tests"), where `producedArtifacts[outputFile]` is always undefined (snapshotTree
 *  only keys individual files). Exported so a hermetic guard can prove the reconstruction is non-empty
 *  (the latent bug: a bare-key lookup made the red judge always short-circuit to "no tests produced"). */
export function concatTreeFiles(producedArtifacts: Record<string, string>, prefix: string, exts: readonly string[]): string {
  return Object.entries(producedArtifacts)
    .filter(([k]) => k.startsWith(prefix) && exts.some((e) => k.endsWith(e)))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => v)
    .join("\n");
}

/** Read a required recorded-code reference that is an app/ DIRECTORY (a tree of .py files) from the
 *  CAMP and concatenate its .py contents into ONE text, the SAME shape the driver-green judge builds
 *  from the candidate's produced app/ (its `app/**\/*.py` joined). Sorted by relpath so the reference
 *  text is deterministic across runs. Throws loud if the dir is absent or holds no .py (the code
 *  judge is mandatory and cannot run without its reference , never a silent skip). Exported for a
 *  hermetic guard test. */
export function readCampAppDir(relFromCorpusRoot: string, what: string): string {
  const dir = join(process.cwd(), BUILD_CORPUS_REL, relFromCorpusRoot);
  if (!existsSync(dir)) {
    throw new Error(`optimize-role: MISSING recorded reference for ${what} at ${dir} , the LLM judge is mandatory and cannot run without it. Extract it from the corpus into the camp first.`);
  }
  const tree = snapshotTree(dir, dir); // { relpath -> contents } for every file under the app dir
  const text = Object.entries(tree)
    .filter(([k]) => k.endsWith(".py"))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => v)
    .join("\n");
  if (!text.trim()) {
    throw new Error(`optimize-role: recorded reference for ${what} at ${dir} has no .py files , cannot judge produced code against an empty reference.`);
  }
  return text;
}

/** Build the MANDATORY per-chain judge (a QualityGate closure). Every chain kind routes to its OWN
 *  existing discriminator in consort/evaluation/semantic-gate, comparing the candidate's produced
 *  output to the committed recorded reference. There is NO judge-less branch , an LLM judge is a hard
 *  requirement of every evaluation (the guarantee of product-result equivalence). A missing reference
 *  throws (evaluation invalid), never a silent skip. */
export function buildChainJudge(chain: RoleChain | BuildRoleChain, handle: string, isBuildChain: boolean): QualityGate {
  const cwd = process.cwd();
  if (!isBuildChain) {
    // DESIGN chains: opus semantic judge vs the recorded per-turn artifact (camp).
    const reference = readReference(chain as RoleChain, handle);
    if (reference === undefined) {
      throw new Error(`optimize-role: MISSING recorded reference for design chain '${handle}' , the LLM judge is mandatory. Point the chain's referenceFile at a committed recorded per-turn output.`);
    }
    const judge = makeOpusJudge({ cwd });
    return {
      judgeCandidate: async ({ primary }) => {
        if (primary === undefined) return { passed: false, reason: "no primary artifact to judge" };
        const v = await judge({ step: "acs" as never, reference, candidate: primary });
        return { passed: v.score >= SEMANTIC_THRESHOLD, score: v.score };
      },
    };
  }

  const b = chain as BuildRoleChain;
  if (b.assertKind === "red") {
    // navigator-red: functional coverage of the produced tests vs the recorded test-list.
    const reference = readCampReference("recorded-artifacts/features/F6-split-tracking-code/test-list.json", "navigator-red test-list");
    const judge = makeOpusJudge({ cwd });
    return {
      judgeCandidate: async ({ primary, producedArtifacts }) => {
        // navigator-red's outputFile is the "tests" DIRECTORY, not a single file, so
        // `primary = producedArtifacts["tests"]` is ALWAYS undefined (snapshotTree only ever keys
        // individual files, tests/foo.py). Reconstruct the judged text by concatenating the produced
        // tests/**.{py,ts,tsx} (sorted, deterministic , concatTreeFiles). This was a latent bug: the
        // bare-key lookup made red ALWAYS return "no tests produced" => passed:false, so it never
        // actually scored. Fall back to `primary` for a file-shaped outputFile.
        const testsText = primary ?? concatTreeFiles(producedArtifacts, "tests/", [".py", ".ts", ".tsx"]);
        if (!testsText.trim()) return { passed: false, reason: "no tests produced to judge" };
        const v = await judge({ step: "test-list" as never, reference, candidate: testsText, functional: "tests" as BuildOutputKind });
        return { passed: v.score >= FUNCTIONAL_THRESHOLD, score: v.score };
      },
    };
  }
  if (b.assertKind === "assess") {
    // navigator-assess: align the candidate's marker to the RECORDED assess ground truth, via the
    // SHARED evaluateNavigatorAssessAlignment (classification-match hard gate + supersession delta
    // judge). Both parseNavigatorAssessMarker + the alignment read a DIR; the sweep captures the
    // produced marker as in-memory text (its mkdtemp workspace is already gone), so write the
    // candidate's marker files to a scratch dir and align against the recorded verdict.
    const recordedVerdict = parseNavigatorAssessMarker(
      join(cwd, BUILD_CORPUS_REL, "recorded-build/features/F6-split-tracking-code/stories/S1-split-columns-migration/turns/004-navigator-assess-AC1-batch-serial-columns-added/tdd/cycles/F6-split-tracking-code/S1-split-columns-migration/AC1-batch-serial-columns-added"),
    );
    const deltaJudge = makeSupersessionDeltaJudge({ cwd });
    return {
      judgeCandidate: async ({ candidateId, producedArtifacts }) => {
        const markerDir = mkdtempSync(join(tmpdir(), `assess-marker-${candidateId}-`));
        try {
          let wroteMarker = false;
          for (const name of ["superseded-tests.json", "regression-assessment.json"]) {
            const key = Object.keys(producedArtifacts).find((k) => k.endsWith(name));
            if (key !== undefined) { writeFileSync(join(markerDir, name), producedArtifacts[key]); wroteMarker = true; }
          }
          // No marker => the candidate judged the code clean (equivalent), which parseNavigatorAssessMarker
          // reads from an empty dir , a legitimate verdict, not a missing artifact.
          void wroteMarker;
          const outcome = await evaluateNavigatorAssessAlignment({ recordedVerdict, navigatorMarkerDir: markerDir, deltaJudge });
          return { passed: outcome.passed, classification: outcome.classificationMatch ? recordedVerdict.classification : "insufficient", reason: outcome.reason };
        } finally {
          rmSync(markerDir, { recursive: true, force: true });
        }
      },
    };
  }
  // navigator-review / navigator-reflect: verdict-alignment vs the recorded verdict (camp).
  const isReview = b.assertKind === "review";
  const refRel = isReview
    ? "recorded-build/features/F6-split-tracking-code/stories/S3-stock-shows-split-fields/turns/001-navigator-reflect/tdd/cycles/F6-split-tracking-code/S1-split-columns-migration/AC1-batch-serial-columns-added/review-verdict.json"
    : "recorded-artifacts/features/F6-split-tracking-code/stories/S3-stock-shows-split-fields/reflect-verdict.json";
  const recordedVerdict = parseVerdictFile(readCampReference(refRel, `navigator-${b.assertKind} verdict`));
  const alignJudge = makeVerdictAlignmentJudge({ cwd });
  return {
    judgeCandidate: async ({ producedArtifacts }) => {
      const key = b.verdictFile && producedArtifacts[b.verdictFile] !== undefined
        ? b.verdictFile
        : Object.keys(producedArtifacts).find((k) => k.endsWith(isReview ? "review-verdict.json" : "reflect-verdict.json"));
      if (!key) return { passed: false, reason: `no ${b.assertKind}-verdict produced to judge` };
      const candidateVerdict = parseVerdictFile(producedArtifacts[key]);
      const v = await alignJudge({ recordedVerdict, candidateVerdict, kind: isReview ? "review" : "reflect" });
      return { passed: v.passed, reason: v.reason };
    },
  };
}

/** The MANDATORY per-DRIVER-TURN judge (a QualityGate closure), SHARED by the live sweep (sweepDriverGreen)
 *  and the re-judge harness so BOTH score a driver candidate identically: run the candidate's captured
 *  NEXT-STEP navigator determination (marker files under NEXT_STEP_MARKER_PREFIX in producedArtifacts)
 *  through evaluateNextStepDetermination, comparing it to the CONTAINED recorded determination for that
 *  driver turn (assume corpus gone). Reuses makeSupersessionDeltaJudge (assess set-delta) +
 *  makeVerdictAlignmentJudge (review). Maps the directional verdict: pass + pass-with-honors => passed
 *  (honors surfaced via classification + nextStep); fail => not passed. A missing reference throws. */
export function buildDriverNextStepJudge(handle: string): QualityGate {
  const spec = DRIVER_TURN_SPECS[handle];
  if (!spec) throw new Error(`optimize-role: buildDriverNextStepJudge , unknown driver handle "${handle}"`);
  const cwd = process.cwd();
  const deltaJudge = makeSupersessionDeltaJudge({ cwd });
  const verdictJudge = makeVerdictAlignmentJudge({ cwd });
  const recordedRefDir = join(cwd, BUILD_CORPUS_REL, spec.refRel);
  if (!existsSync(recordedRefDir)) {
    throw new Error(`optimize-role: MISSING contained next-step reference for ${handle} at ${recordedRefDir} , the LLM judge is mandatory and cannot run without it.`);
  }
  const recordedReviewDirective: VerdictOutput | undefined =
    spec.evaluatorKind === "review" ? parseVerdictFile(readCampReference(join(spec.refRel, "review-verdict.json"), `${handle} recorded review directive`)) : undefined;
  return {
    judgeCandidate: async ({ candidateId, producedArtifacts }) => {
      // Materialize the candidate's captured next-step marker files into a scratch dir (strip the prefix).
      const markerDir = mkdtempSync(join(tmpdir(), `nextstep-${candidateId}-`));
      try {
        for (const [k, v] of Object.entries(producedArtifacts)) {
          if (k.startsWith(NEXT_STEP_MARKER_PREFIX)) writeFileSync(join(markerDir, k.slice(NEXT_STEP_MARKER_PREFIX.length)), v);
        }
        const outcome = await evaluateNextStepDetermination({
          evaluatorKind: spec.evaluatorKind,
          deltaJudge,
          verdictJudge,
          ...(spec.evaluatorKind === "assess"
            ? { recordedMarkerDir: recordedRefDir, candidateMarkerDir: markerDir }
            : {
                recordedReviewDirective,
                candidateReview: parseVerdictFile(producedArtifacts[`${NEXT_STEP_MARKER_PREFIX}review-verdict.json`] ?? "{}"),
              }),
        });
        const passed = outcome.verdict !== "fail";
        const classification = outcome.verdict === "pass-with-honors" ? "pass-with-honors" : outcome.candidateClass;
        return { passed, classification, nextStep: outcome.verdict, reason: outcome.reason };
      } finally {
        rmSync(markerDir, { recursive: true, force: true });
      }
    },
  };
}

/** Sweep ONE chain end to end + persist its evidence + report under <runRoot>/<handle>/. Returns
 *  the chain's report (for the multi-chain roll-up). LIVE , each candidate spawns a real claude
 *  turn; candidates fan out under `concurrency`. Handles both design role chains and build chains. */
export async function sweepOneChain(
  handle: string,
  runRoot: string,
  opts: { baseModel?: string; concurrency?: number; baselineDir?: string } = {},
): Promise<SweepReport> {
  // Determine if this is a design or build chain.
  const isBuildChain = handle in BUILD_ROLE_CHAINS;
  const chain = isBuildChain ? BUILD_ROLE_CHAINS[handle] : ROLE_CHAINS[handle];
  if (!chain) {
    throw new Error(`optimize-role: unknown chain "${handle}"`);
  }

  const baseModel = baseModelFor(handle, opts.baseModel);
  // The test-strategist is a SUPERVISOR , its optimization target is the per-analyst SUBAGENT levers,
  // not its own model. Its candidate set permutes ALL enabled analysts (behavior/fitness/client);
  // every other chain uses the single-role model/effort set.
  const candidates =
    handle === "test-strategist"
      ? testStrategistCandidates(enabledAnalysts({ projectDir: "", uiTrack: true }).map((a) => a.kind))
      : roleCandidates(baseModel);
  const runDir = join(runRoot, handle);
  mkdirSync(runDir, { recursive: true });

  // MANDATORY per-chain JUDGE , every chain kind supplies its OWN existing discriminator (an LLM
  // judge is required for every evaluation; it is the only guarantee of product-result equivalence).
  // A missing recorded reference is a HARD ERROR here (the evaluation cannot run without it), never a
  // silent skip. The closure is handed to runRoleSweep, which judges every conformant candidate and
  // DISQUALIFIES any with no verdict. Judges are the SHARED ones in consort/evaluation/semantic-gate.
  const quality: QualityGate = buildChainJudge(chain, handle, isBuildChain);

  // eslint-disable-next-line no-console
  console.log(
    `[optimize-role] ${handle}: ${isBuildChain ? "BUILD" : "DESIGN"} chain, baseline model=${baseModel}, ${candidates.length} candidates, concurrency=${opts.concurrency ?? 1}. ` +
      `quality judge: MANDATORY (per-chain discriminator). run dir: ${runDir}`,
  );

  const runChain: ChainRunner = isBuildChain
    ? async (c, agentFor, _id, levers) =>
        runBuildRoleChainLive(c as BuildRoleChain, {
          agentFor: agentFor as (m: StepManifest) => StepAgent | undefined,
        })
    : async (c, agentFor, _id, levers) =>
        runRoleChainLive(c as RoleChain, {
          agentFor: agentFor as (m: StepManifest) => StepAgent | undefined,
          // TEST-STRATEGIST: forward the candidate's per-analyst overrides into the roster preparer.
          ...(levers.analystOverrides ? { analystOverrides: levers.analystOverrides } : {}),
        });
  const trials = await runRoleSweep(chain, candidates, runChain, {
    ...(quality ? { quality } : {}),
    ...(opts.concurrency ? { concurrency: opts.concurrency } : {}),
    onStart: (candidate, i, total) => {
      // eslint-disable-next-line no-console
      console.log(`[optimize-role] ${handle} (${i}/${total}) running ${candidate.id} , levers ${JSON.stringify(candidate.levers)} ...`);
    },
    // PRESERVE each candidate's full result AS IT COMPLETES (not batched at the end): its
    // telemetry, its produced artifacts (the actual files), and a replay.json (levers + seed
    // corpus ref) , so the experiment is reproducible + re-judgeable, and an interrupted sweep
    // still leaves every finished candidate's evidence on disk.
    onDone: (trial, i, total) => {
      persistTrial(runDir, chain, baseModel, trial);
      const q = trial.qualityPassed === undefined ? "" : trial.qualityPassed ? " quality PASSED" : ` quality FAILED (${trial.telemetry?.semanticScore?.toFixed(2)})`;
      const status = trial.disqualified ? `DISQUALIFIED (${trial.reason})` : trial.gatePassed ? "gate PASSED" : "gate failed";
      // eslint-disable-next-line no-console
      console.log(`[optimize-role] ${handle} (${i}/${total}) ${trial.candidateId}: ${status}${q}${trial.telemetry?.outerDurationMs ? ` , ${(trial.telemetry.outerDurationMs / 1000).toFixed(1)}s` : ""}`);
    },
  });

  const report = reportRoleSweep(trials);
  // Write the report itself into the chain's run dir , the run's own summary lives with its evidence.
  writeFileSync(join(runDir, "report.txt"), formatRoleSweepReport(report) + "\n");

  // Write a machine-readable summary.json (winner + per-candidate median/gate) in the SAME shape the
  // committed design-lane corpus (examples/replay/optimize-results/<handle>/summary.json) uses, so a
  // run is durable + diffable. When a PRIOR summary exists for this chain (a baseline / last run),
  // print the delta so "repeat + compare" is a first-class output, not a manual diff.
  const summary = buildChainSummary(handle, baseModel, trials, report);
  const prior = opts.baselineDir ? readPriorSummary(opts.baselineDir, handle) : undefined;
  writeFileSync(join(runDir, "summary.json"), JSON.stringify(summary, null, 2) + "\n");

  // eslint-disable-next-line no-console
  console.log(`\n[${handle}]\n` + formatRoleSweepReport(report));
  if (prior) {
    // eslint-disable-next-line no-console
    console.log(formatBaselineDelta(handle, prior, summary));
  }
  return report;
}

/** One chain's durable summary , winner + per-candidate median ms / gate / quality. Mirrors the
 *  committed examples/replay/optimize-results/<handle>/summary.json shape so both corpora are diffable. */
interface ChainSummary {
  chain: string;
  baseModel: string;
  winner: string | null;
  baselineMs: number | null;
  capturedAt: string;
  candidates: Array<{ candidate: string; gatePassed: boolean; qualityPassed?: boolean; medianMs: number | null; disqualified?: boolean }>;
}

function buildChainSummary(handle: string, baseModel: string, trials: SweepTrial[], report: ReturnType<typeof reportRoleSweep>): ChainSummary {
  return {
    chain: handle,
    baseModel,
    winner: report.winner?.candidateId ?? null,
    baselineMs: report.baselineMs ?? null,
    capturedAt: new Date().toISOString(),
    candidates: trials.map((t) => ({
      candidate: t.candidateId,
      gatePassed: t.gatePassed,
      ...(t.qualityPassed !== undefined ? { qualityPassed: t.qualityPassed } : {}),
      medianMs: t.telemetry?.outerDurationMs ?? null,
      ...(t.disqualified ? { disqualified: true } : {}),
    })),
  };
}

/** Read a prior run's summary.json for a chain (the baseline to compare against), if present. */
function readPriorSummary(baselineDir: string, handle: string): ChainSummary | undefined {
  const p = join(baselineDir, handle, "summary.json");
  if (!existsSync(p)) return undefined;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as ChainSummary;
  } catch {
    return undefined;
  }
}

/** A human delta line comparing this run's summary to a prior one: winner change + baseline wall-clock drift. */
function formatBaselineDelta(handle: string, prior: ChainSummary, now: ChainSummary): string {
  const winnerChange = prior.winner === now.winner ? `winner unchanged (${now.winner ?? "none"})` : `winner CHANGED: ${prior.winner ?? "none"} -> ${now.winner ?? "none"}`;
  const ms = (v: number | null) => (v == null ? "?" : `${(v / 1000).toFixed(1)}s`);
  const drift =
    prior.baselineMs != null && now.baselineMs != null
      ? ` , baseline ${ms(prior.baselineMs)} -> ${ms(now.baselineMs)} (${(((now.baselineMs - prior.baselineMs) / prior.baselineMs) * 100).toFixed(0)}%)`
      : "";
  return `[compare] ${handle}: ${winnerChange}${drift} , prior run ${prior.capturedAt}`;
}

/** Run the sweep for EVERY requested chain, each standalone against its reference example, and
 *  print a per-chain report + a roll-up. Returns the reports keyed by handle. LIVE. Chains run in
 *  sequence; each chain's candidates fan out under `concurrency` (a global cap , the chains do not
 *  overlap, so N concurrency is N in-flight candidates at any moment). */
export async function runOptimizeRole(args: OptimizeRoleArgs): Promise<Record<string, SweepReport | { summary: unknown }>> {
  // Results land in the VISIBLE, git-tracked corpus (examples/replay/optimize-results/), NOT a hidden
  // dir , so a run is durable + reviewable + diffable. Each run gets a timestamped subdir under runs/
  // so prior runs accumulate; the newest prior run (if any) is the BASELINE this run's summary.json is
  // compared against + a delta printed. Override with --telemetry-dir for an ad-hoc scratch run.
  const resultsHome = join(process.cwd(), "examples/replay/optimize-results");
  const runsDir = join(resultsHome, "runs");
  const baselineDir = latestRunDir(runsDir); // the most recent prior run, or undefined on the first
  const runRoot = args.telemetryDir ?? join(runsDir, runStamp());
  mkdirSync(runRoot, { recursive: true });
  // eslint-disable-next-line no-console
  console.log(`[optimize-role] sweeping ${args.chains.length} chain(s): ${args.chains.join(", ")} , run root ${runRoot}${baselineDir ? ` (baseline: ${baselineDir})` : " (no prior run , this is the baseline)"}`);

  const reports: Record<string, SweepReport | { summary: unknown }> = {};
  for (const handle of args.chains) {
    if (handle in DRIVER_TURN_SPECS) {
      reports[handle] = await sweepDriverGreen(handle, runRoot, {
        ...(args.concurrency ? { concurrency: args.concurrency } : {}),
        ...(args.candidates?.length ? { candidates: args.candidates } : {}),
      });
    } else {
      reports[handle] = await sweepOneChain(handle, runRoot, {
        ...(args.baseModel ? { baseModel: args.baseModel } : {}),
        ...(args.concurrency ? { concurrency: args.concurrency } : {}),
        ...(baselineDir ? { baselineDir } : {}),
      });
    }
  }

  // Roll-up: one winner line per chain, written to the run root + printed.
  // The driver handles are CLOUD LIVE with a different result shape, so they are skipped from the
  // role-sweep rollup + summarized separately below.
  const rollupChains = args.chains.filter((h) => !(h in DRIVER_TURN_SPECS));
  const rollup = rollupChains
    .map((h) => {
      const rep = reports[h] as SweepReport | undefined;
      if (!rep) return `${h}: (no report)`;
      const w = rep.winner;
      return w
        ? `${h}: winner ${w.candidateId} (${(w.outerDurationMs / 1000).toFixed(1)}s vs baseline ${(rep.baselineMs / 1000).toFixed(1)}s, saved ${w.speedupPct.toFixed(0)}%)`
        : `${h}: no winner (no quality-holding candidate beat the baseline)`;
    })
    .join("\n");

  // Driver-handle summaries (if present).
  for (const h of args.chains.filter((c) => c in DRIVER_TURN_SPECS)) {
    const driverResult = reports[h];
    if (driverResult && "summary" in driverResult) {
      const s = (driverResult.summary as { winner?: string | null; candidates?: Array<{ candidate: string }> }) ?? {};
      const w = s.winner;
      // eslint-disable-next-line no-console
      console.log(`\n[${h}]\n${w ? `${h}: winner ${w}` : `${h}: no winner`}`);
    }
  }

  if (rollup) {
    writeFileSync(join(runRoot, "rollup.txt"), rollup + "\n");
    // eslint-disable-next-line no-console
    console.log(`\n=== ROLL-UP ===\n${rollup}\n\n(full evidence per chain -> ${runRoot}/<handle>/)`);
  }
  return reports;
}

/** A compact UTC run stamp so repeat sweeps land in distinct, non-clobbering dirs. */
function runStamp(): string {
  // YYYYMMDDHHMMSS (14 digits). toISOString -> 2026-08-07T13:46:37.123Z; strip separators + the
  // fractional-seconds tail so the dir name is clean (no trailing dot from slicing mid-fraction).
  return new Date().toISOString().replace(/[-:T]/g, "").replace(/\..*$/, "");
}

/** The most recent prior run dir under runs/ (the baseline this run compares against), or undefined
 *  on the first-ever run. Run dirs are timestamp-named (runStamp), so lexical max = newest. */
function latestRunDir(runsDir: string): string | undefined {
  if (!existsSync(runsDir)) return undefined;
  const dirs = readdirSync(runsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  const newest = dirs[dirs.length - 1];
  return newest ? join(runsDir, newest) : undefined;
}

/** The recorded reference the quality gate scores a candidate against. An explicit `referenceFile`
 *  is the RECORDED PER-TURN OUTPUT extracted into the CAMP (recorded-turns/<NNNN>-<role>/...), the
 *  honest same-scope reference , resolved against the camp root. Absent, fall back to the produced
 *  artifact's recorded form in the seed corpus (intake). Absent there too -> undefined (gate skipped).
 *  This is the #705 correction: judge against what the turn ACTUALLY recorded, never a hand-carved
 *  slice. See feedback_judge_against_recorded_turn_output + the camp README. */
function readReference(chain: RoleChain, _role: string): string | undefined {
  if (chain.referenceFile) {
    const camp = join(process.cwd(), BUILD_CORPUS_REL, chain.referenceFile);
    if (existsSync(camp)) return readFileSync(camp, "utf8");
  }
  const p = join(process.cwd(), INTAKE_REL, chain.referenceFile ?? chain.outputFile);
  return existsSync(p) ? readFileSync(p, "utf8") : undefined;
}

/** Persist ONE candidate's full evidence under <runDir>/<candidate>/: telemetry.json, the
 *  produced artifact tree (artifacts/<relpath>), and replay.json (levers + seed corpus ref +
 *  base model), so the experiment can be reproduced + independently re-judged. */
function persistTrial(runDir: string, chain: RoleChain, baseModel: string, trial: SweepTrial): void {
  const dir = join(runDir, trial.candidateId);
  mkdirSync(dir, { recursive: true });
  if (trial.telemetry) writeFileSync(join(dir, "telemetry.json"), JSON.stringify(trial.telemetry, null, 2) + "\n");
  // The actual produced files (the outputs) , the evidence telemetry alone can't provide.
  for (const [rel, contents] of Object.entries(trial.producedArtifacts ?? {})) {
    const dest = join(dir, "artifacts", rel);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, contents);
  }
  // Whether this trial durably stored a NAVIGATOR EVALUATION of the driver output (driver chains only):
  // the navigator-eval/ marker files under artifacts/. Indexed in replay.json so a separate test OF THE
  // NAVIGATOR can discover the samples (which driver candidates the navigator assessed/reviewed, and how).
  const navigatorEvalFiles = Object.keys(trial.producedArtifacts ?? {})
    .filter((k) => k.startsWith("navigator-eval/"))
    .map((k) => k.slice("navigator-eval/".length));
  // How to recreate this exact trial.
  const replay = {
    role: chain.dir,
    candidateId: trial.candidateId,
    baseModel,
    levers: trial.levers,
    seedCorpus: `${INTAKE_REL} (recorded intake replayed into the chain)`,
    gatePassed: trial.gatePassed,
    ...(trial.qualityPassed !== undefined ? { qualityPassed: trial.qualityPassed } : {}),
    ...(trial.telemetry?.classification ? { classification: trial.telemetry.classification } : {}),
    ...(navigatorEvalFiles.length ? { navigatorEval: { dir: "artifacts/navigator-eval", files: navigatorEvalFiles } } : {}),
    ...(trial.disqualified ? { disqualified: true, reason: trial.reason } : {}),
  };
  writeFileSync(join(dir, "replay.json"), JSON.stringify(replay, null, 2) + "\n");
}

// ── INDEPENDENT RE-JUDGE: re-score a PRESERVED run's outputs through their OWN discriminator ──────────
//
// The "everything preserved so an independent judge can re-evaluate" invariant, made executable. For a
// persisted run dir (<runRoot>/<chain>/<candidate>/artifacts/...), read each candidate's produced output
// back off disk, resolve the SAME discriminator the live sweep uses (buildChainJudge for design/navigator,
// buildDriverNextStepJudge for driver), re-run it against the SAME recorded reference, and compare the
// fresh verdict to the stored telemetry.json. NO live drive, NO cloud project, NO green cycle , just the
// opus judge over preserved bytes, so it is safe to run independently (does not touch a live sweep's
// substrate). Writes rejudge.json per candidate + prints a reproduce report.

/** Load a candidate's preserved artifacts/ tree back into a producedArtifacts map (relpath -> contents),
 *  the SAME shape the live judge consumed. Pure (fs read). Empty when the dir is absent. */
export function loadPreservedArtifacts(candidateDir: string): Record<string, string> {
  const root = join(candidateDir, "artifacts");
  if (!existsSync(root)) return {};
  const out: Record<string, string> = {};
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, e.name);
      if (e.isDirectory()) walk(abs);
      else if (e.isFile()) out[relative(root, abs)] = readFileSync(abs, "utf8");
    }
  };
  walk(root);
  return out;
}

/** A judge verdict whose reason signals its JUDGED TARGET was absent (the produced artifact the judge
 *  scores , the primary file / the tests tree / the review-or-reflect verdict / the app code). During a
 *  re-judge of PRESERVED data this is NOT a real FAIL: it means that target was not preserved (the run
 *  preserved SOME files but not the one the judge reads , e.g. navigator-reflect kept its code tree but
 *  not reflect-verdict.json). So it is "not rejudgeable (judge target not preserved)", same category as
 *  an entirely-empty artifacts/ dir, never a fresh FAIL. Matches the judges' own "no ... to judge" family
 *  (buildChainJudge + buildDriverNextStepJudge); a genuine content FAIL never carries these reasons. */
export function isMissingJudgeTarget(reason: string | undefined): boolean {
  if (!reason) return false;
  return /no primary artifact to judge|no tests produced to judge|-verdict produced to judge|no app\/ code produced to judge|no .*code produced to judge/i.test(reason);
}

/** Classify a re-judge outcome vs the stored verdict. Keys on whether a stored verdict VALUE exists
 *  (classification OR score) , a telemetry.json can exist verdict-less for a never-judged run, which is
 *  "first-verdict", NOT a reproduce. Compares the right KIND: classification-based judges (build
 *  discriminator) by EXACT class; score-based judges (design/red) by |Δ| <= tol (opus judges are
 *  near-deterministic, not bit-identical , default tol 0.1). Pure + exported for a hermetic guard. */
export function classifyReproduce(
  stored: { storedClass?: string; storedScore?: number },
  fresh: { classification?: string; score?: number },
  tol = 0.1,
): string {
  const hasStoredVerdict = stored.storedClass !== undefined || stored.storedScore !== undefined;
  if (!hasStoredVerdict) return "first-verdict (never judged before)";
  if (stored.storedClass !== undefined || fresh.classification !== undefined) {
    return stored.storedClass === fresh.classification ? "REPRODUCED" : `DIVERGED (stored=${stored.storedClass ?? "?"} fresh=${fresh.classification ?? "?"})`;
  }
  const delta = Math.abs((stored.storedScore ?? 0) - (fresh.score ?? 0));
  return delta <= tol ? `REPRODUCED (Δscore=${delta.toFixed(2)})` : `DIVERGED (stored=${stored.storedScore} fresh=${fresh.score}, Δ=${delta.toFixed(2)})`;
}

/** Re-judge every candidate of every chain under a preserved run dir. For each candidate: reconstruct
 *  producedArtifacts from artifacts/, resolve the chain's discriminator, re-run it vs the recorded
 *  reference, and compare to the stored telemetry verdict. Writes <candidate>/rejudge.json + prints a
 *  reproduce report. LOCAL (opus judges only) , safe to run alongside nothing-live. */
export async function runRejudge(runRoot: string): Promise<void> {
  if (!existsSync(runRoot)) throw new Error(`optimize-role --rejudge: run dir not found: ${runRoot}`);
  // eslint-disable-next-line no-console
  console.log(`[rejudge] re-judging preserved outputs under ${runRoot}`);
  const chainDirs = readdirSync(runRoot, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  for (const handle of chainDirs) {
    const chainDir = join(runRoot, handle);
    const isDriver = handle in DRIVER_TURN_SPECS;
    const isBuildChain = handle in BUILD_ROLE_CHAINS;
    const chain = isDriver ? undefined : (isBuildChain ? BUILD_ROLE_CHAINS[handle] : ROLE_CHAINS[handle]);
    if (!isDriver && !chain) { console.log(`[rejudge] ${handle}: not a known chain, skipping`); continue; }
    // Resolve the SAME discriminator the live sweep used , driver via buildDriverNextStepJudge, else buildChainJudge.
    let quality: QualityGate;
    try {
      quality = isDriver ? buildDriverNextStepJudge(handle) : buildChainJudge(chain!, handle, isBuildChain);
    } catch (e) {
      console.log(`[rejudge] ${handle}: cannot resolve discriminator (${e instanceof Error ? e.message : String(e)}); skipping`);
      continue;
    }
    const outputFile = isDriver ? "app" : (chain as RoleChain | BuildRoleChain).outputFile;
    const candDirs = readdirSync(chainDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
    for (const candidateId of candDirs) {
      const candDir = join(chainDir, candidateId);
      const producedArtifacts = loadPreservedArtifacts(candDir);
      if (Object.keys(producedArtifacts).length === 0) {
        console.log(`[rejudge] ${handle}/${candidateId}: NO preserved artifacts , cannot re-judge (output not preserved)`);
        writeFileSync(join(candDir, "rejudge.json"), JSON.stringify({ handle, candidateId, rejudgeable: false, reason: "no preserved artifacts" }, null, 2) + "\n");
        continue;
      }
      const stored = existsSync(join(candDir, "telemetry.json"))
        ? (JSON.parse(readFileSync(join(candDir, "telemetry.json"), "utf8")) as { semanticScore?: number; classification?: string })
        : undefined;
      const primary = producedArtifacts[outputFile];
      let verdict: QualityVerdict;
      try {
        verdict = await quality.judgeCandidate({ candidateId, primary, producedArtifacts });
      } catch (e) {
        console.log(`[rejudge] ${handle}/${candidateId}: judge threw: ${e instanceof Error ? e.message : String(e)}`);
        writeFileSync(join(candDir, "rejudge.json"), JSON.stringify({ handle, candidateId, rejudgeable: true, error: e instanceof Error ? e.message : String(e) }, null, 2) + "\n");
        continue;
      }
      // The judge short-circuited because its JUDGED TARGET was not preserved (some artifacts exist, but
      // not the specific file/tree this judge scores , e.g. navigator-reflect kept its code tree but not
      // reflect-verdict.json). That is NOT a real FAIL: it is not-rejudgeable, same as an empty dir.
      if (!verdict.passed && isMissingJudgeTarget(verdict.reason)) {
        console.log(`[rejudge] ${handle}/${candidateId}: NOT rejudgeable , judge target not preserved (${verdict.reason})`);
        writeFileSync(join(candDir, "rejudge.json"), JSON.stringify({ handle, candidateId, rejudgeable: false, reason: `judge target not preserved: ${verdict.reason}` }, null, 2) + "\n");
        continue;
      }
      // Reproduce check , see classifyReproduce: keys on whether a stored verdict VALUE exists (not the
      // telemetry FILE, which can exist verdict-less for a never-judged run), compares the right KIND per
      // judge (classification exact; score within tolerance), flags first-verdict when nothing was stored.
      const storedClass = stored?.classification;
      const storedScore = stored?.semanticScore;
      const reproduce = classifyReproduce({ storedClass, storedScore }, { classification: verdict.classification, score: verdict.score });
      const hasStoredVerdict = storedClass !== undefined || storedScore !== undefined;
      const report = { handle, candidateId, rejudgeable: true, fresh: { passed: verdict.passed, score: verdict.score, classification: verdict.classification, reason: verdict.reason }, stored: hasStoredVerdict ? { score: storedScore, classification: storedClass } : null, reproduce };
      writeFileSync(join(candDir, "rejudge.json"), JSON.stringify(report, null, 2) + "\n");
      // eslint-disable-next-line no-console
      console.log(`[rejudge] ${handle}/${candidateId}: fresh=${verdict.passed ? "PASS" : "FAIL"}${verdict.classification ? ` (${verdict.classification})` : ""}${verdict.score !== undefined ? ` score=${verdict.score.toFixed(2)}` : ""} , ${reproduce}`);
    }
  }
  // eslint-disable-next-line no-console
  console.log(`[rejudge] done. Per-candidate rejudge.json written under ${runRoot}.`);
}

if (isCliEntry(import.meta.url)) {
  // --rejudge <runDir> : re-score a preserved run's outputs through their own discriminator (LOCAL, no
  // live drive). Otherwise run the normal sweep.
  const rejudgeIdx = process.argv.indexOf("--rejudge");
  const entry = rejudgeIdx >= 0 && rejudgeIdx + 1 < process.argv.length
    ? runRejudge(process.argv[rejudgeIdx + 1])
    : runOptimizeRole(parseArgs(process.argv.slice(2)));
  entry
    .then(() => process.exit(0)) // a sweep with no winner is still a successful run
    .catch((e) => {
      // eslint-disable-next-line no-console
      console.error(`[optimize-role] FAILED: ${e instanceof Error ? e.message : String(e)}`);
      process.exit(1);
    });
}
