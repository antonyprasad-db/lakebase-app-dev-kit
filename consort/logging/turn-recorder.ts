// Universal turn recorder: a first-class capture of EVERY state-machine turn the
// deterministic driver takes (design, gates, build, deploy, accept, promote),
// recording the artifacts that turn produced as a replayable timeline.
//
// This generalizes the build-only recorder (recordBuildTurn) to the whole
// machine , the design lane in particular had no recorder, so the design corpus
// used to be hand-assembled. Wired via `withTurnRecording` (drive.cli.ts), gated
// on LAKEBASE_CONSORT_RECORD_DIR, fired AFTER each turn's effect lands.
//
// Layout under recordDir (the answer to "record every step, replayably"):
//   turns/<NNNN>-<label>/turn.json   , manifest {step, kind, role, mode, story, ac, action, produced[], deleted[]}
//   turns/<NNNN>-<label>/files/<rel> , the .tdd + code DELTA this turn produced
//   turns/index.json                 , the ordered list of every recorded turn
//   recorded-artifacts/<rel under .tdd> , the CUMULATIVE .tdd mirror, so the
//                                          existing replayDesignTurn(replayDir=
//                                          recorded-artifacts) consumes it as-is
//   .recorder-state.json             , internal file-hash map for delta computation
//
// recorded-build/ (the per-turn code corpus replayBuildTurn reads) is populated
// by the existing recordBuildTurn, which `withTurnRecording` calls for build
// turns , so design + build replay both round-trip from one recordDir.

import { createHash } from "node:crypto";
import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { codeTreeFilter } from "./replay-build.js";
import type { WorkflowAction } from "../../consort/orchestrator/workflow/workflow-vocabulary.js";

/** A relpath the recorder watches, keyed to its scan root (so the cumulative
 *  .tdd mirror can be re-rooted under recorded-artifacts). */
interface ScannedFile {
  /** Absolute path on disk. */
  abs: string;
  /** Path relative to projectDir (the stable key across turns). */
  rel: string;
  /** Whether this file lives under .tdd (-> mirrored into recorded-artifacts). */
  underTdd: boolean;
  /** Content hash. */
  sha: string;
}

/** An agent turn's outcome-level trace, persisted for the demo/visualization:
 *  the prompt the role was dispatched with, its final reasoning text, and the
 *  ordered tool list. Not the raw stream (no interstitial deltas). */
export interface RecordedTranscript {
  prompt: string;
  role?: string;
  model?: string;
  finalText: string;
  tools: string[];
}

export interface RecordTurnArgs {
  /** LAKEBASE_CONSORT_RECORD_DIR , the corpus root. */
  recordDir: string;
  /** Project working tree root (dirname of consortDir). */
  projectDir: string;
  /** The project .tdd dir. */
  consortDir: string;
  /** The action just performed. */
  action: WorkflowAction;
  /** The driver loop iteration (per-process; not globally unique , the recorder
   *  assigns its own monotonic ordinal from the on-disk index). */
  step: number;
  /** The agent turn's transcript (invoke-role turns only); persisted as
   *  transcript.md + summarized into turn.json so the demo can render what each
   *  role was asked, decided, and did. Absent for non-agent turns. */
  transcript?: RecordedTranscript;
}

export interface RecordedTurn {
  /** Globally monotonic ordinal across the whole run (index length at record time). */
  ordinal: number;
  /** turns/<NNNN>-<label> dir name. */
  dir: string;
  /** Relpaths produced (added/changed) this turn. */
  produced: string[];
  /** Relpaths deleted this turn. */
  deleted: string[];
}

/** Append-only log + recorder bookkeeping that must NOT count as a turn's
 *  produced artifact (they churn every turn / are the recorder's own state). */
const NON_ARTIFACT_TDD = new Set(["agent-log.jsonl"]);

/** The build state-bag booleans/ids the router read to CHOOSE this iteration's action , the
 *  routing "why" the turn recorder does not persist. Extracted from the DriveState's active
 *  story build view (the same fields §4 of MASTER-CANONICAL-PROCESS.md graphs). All optional:
 *  a non-build phase (planning/deploy/promote) simply has no active build story. */
export interface RoutingStateBag {
  phase?: string;
  buildActive?: string | null;
  experimentCut?: boolean;
  testsWritten?: boolean;
  codeWritten?: boolean;
  reviewStoryPending?: boolean;
  refactorStoryPending?: boolean;
  reviewAc?: string | null;
  refactorAc?: string | null;
  assessGreenAc?: string | null;
  repairRegressionAc?: string | null;
  greenSupersededAc?: string | null;
  awaitingAcceptance?: boolean;
  deployVerified?: boolean;
  accepted?: boolean;
}

/** One appended routing-decision record: the action chosen this iteration, HOW it was resolved,
 *  and the state bag that produced it. Written to routing-decisions.jsonl (sibling of turns/). */
export interface RoutingDecisionRecord {
  iteration: number;
  source: "nextTransition" | "bounded" | "contract";
  action: WorkflowAction;
  stateBag: RoutingStateBag;
  at: string;
}

/** Project a RoutingStateBag from a DriveState-shaped value , the active build story's bag plus
 *  the phase. Defensive (state shapes vary across lanes); reads only what is present. */
export function projectRoutingStateBag(state: unknown): RoutingStateBag {
  const s = (state ?? {}) as Record<string, unknown>;
  const bag: RoutingStateBag = {};
  if (typeof s.phase === "string") bag.phase = s.phase;
  const active = s.buildActive as string | null | undefined;
  if (active !== undefined) bag.buildActive = active;
  const stories = (s.stories ?? {}) as Record<string, { build?: Record<string, unknown> }>;
  const b = active ? stories[active]?.build : undefined;
  if (b) {
    for (const k of [
      "experimentCut", "testsWritten", "codeWritten", "reviewStoryPending", "refactorStoryPending",
      "reviewAc", "refactorAc", "assessGreenAc", "repairRegressionAc", "greenSupersededAc",
      "awaitingAcceptance", "deployVerified", "accepted",
    ] as const) {
      if (b[k] !== undefined) (bag as Record<string, unknown>)[k] = b[k];
    }
  }
  return bag;
}

/** Append one routing-decision record to routing-decisions.jsonl under the record dir. This is the
 *  diagnostic stream the turn recorder lacks: it captures the ROUTING INPUTS (the state bag), so a
 *  recorded run can answer "why did this turn route here" , not just "what was chosen". */
export function recordRoutingDecision(
  recordDir: string,
  action: WorkflowAction,
  state: unknown,
  iteration: number,
  source: "nextTransition" | "bounded" | "contract",
): void {
  const rec: RoutingDecisionRecord = {
    iteration,
    source,
    action,
    stateBag: projectRoutingStateBag(state),
    at: new Date().toISOString(),
  };
  mkdirSync(recordDir, { recursive: true });
  appendFileSync(join(recordDir, "routing-decisions.jsonl"), JSON.stringify(rec) + "\n");
}

// ─── Correspondence: the human-proxy <-> orchestrator exchange, recorded as a faithful transcript ──
// The turn recorder captures agent turns + routing decisions, but NOT the human-in-the-loop layer:
// the orchestrator's QUESTIONS/requests (the /sprint kickoff, the intake interview, a gate
// presentation) and the HIL's ANSWERS/SUBMISSIONS (interview answers, the artifact it supplied, an
// approve/reject decision). correspondence.jsonl records BOTH sides + the outcome, so a recorded run
// reads like the interactive session it mimics , what was asked, what the (proxy) human answered, and
// whether it validated/approved. One entry per exchange, correlated to the drive iteration.

/** One question the orchestrator asked + the HIL's answer (an intake-interview Q/A pair). */
export interface CorrespondenceQA {
  question: string;
  answer: string;
}

/** What the HIL SUBMITTED in response (an artifact it authored/supplied). `contentRef` points into
 *  the turn's files/ delta (or recorded-artifacts) where the full content lives , the entry carries
 *  the reference, not a duplicate copy of the bytes. */
export interface CorrespondenceSubmission {
  artifact: string;
  from?: string;
  contentRef?: string;
}

/** The RICH PRESENTATION of a correspondence side , what was actually SHOWN/EXCHANGED, with its
 *  formatting preserved, so a renderer can reproduce the interactive session faithfully (not just
 *  plain text). Captures the source markdown (which carries headings/bold/lists/tables/etc.), any
 *  terminal styling as raw ANSI, and structured highlight spans (offset+length+style) over the text
 *  , whichever the surface produced. All optional: a surface fills what it has. */
export interface CorrespondencePresentation {
  /** The formatting the content is authored in (drives how a renderer reproduces it). */
  format?: "markdown" | "ansi" | "plain";
  /** The rendered/authored content WITH its formatting intact (e.g. markdown source, or ANSI text). */
  rendered?: string;
  /** Raw ANSI-styled text as printed to the terminal (colors/bold/underline preserved verbatim). */
  ansi?: string;
  /** Structured styling spans over the plain text (font/weight/color/highlight), for a non-ANSI renderer. */
  highlights?: Array<{ offset: number; length: number; style: string }>;
}

/** One recorded exchange between the orchestrator and the HIL (human or proxy). */
export interface CorrespondenceEntry {
  /** Monotonic 0-based sequence in the correspondence stream (seq 0 = the kickoff). */
  seq: number;
  /** The drive iteration this exchange sits at (kickoff = -1, before the loop). */
  iteration: number;
  at: string;
  phase?: string;
  step?: string;
  /** What the orchestrator ASKED. */
  request: {
    kind: "kickoff" | "intake-interview" | "gate" | "author-requests";
    /** A human-readable rendering of the ask (the command, the gate presentation, the interview intro). */
    prompt: string;
    /** For an intake interview: the question set posed to the HIL. */
    questions?: string[];
    /** The RICH presentation of the ask exactly as SHOWN (formatting/fonts/highlighting preserved). */
    presentation?: CorrespondencePresentation;
  };
  /** What the HIL ANSWERED / SUBMITTED. */
  response: {
    by: "human-proxy" | "human";
    /** Intake-interview answers (paired to request.questions). */
    answers?: CorrespondenceQA[];
    /** The artifact(s) the HIL submitted in response. */
    submitted?: CorrespondenceSubmission[];
    /** A gate/approval decision. */
    decision?: "approved" | "rejected";
    /** The RICH presentation of the answer/submission as SHOWN (formatting/fonts/highlighting preserved). */
    presentation?: CorrespondencePresentation;
  };
  /** The outcome of the exchange (conformance + approval). */
  outcome: {
    validated: boolean;
    approved?: boolean;
    violations?: string[];
  };
}

/** Append one correspondence exchange to correspondence.jsonl under the record dir. This is the
 *  run-level HIL transcript the recorder otherwise lacks , the orchestrator's question paired with the
 *  proxy's answer/submission + outcome, so a recorded capture reads like the interactive session it
 *  mimics. Seq is the caller's monotonic counter (kickoff = 0). */
export function recordCorrespondence(recordDir: string, entry: CorrespondenceEntry): void {
  mkdirSync(recordDir, { recursive: true });
  appendFileSync(join(recordDir, "correspondence.jsonl"), JSON.stringify(entry) + "\n");
}

/**
 * The PRE-STATE + levers an agent turn needs to be replayed IN ISOLATION , the "replay set" bundled
 * per manifest step for optimization experiments. Distinct from the turn's OUTPUT delta (recordTurn):
 * this captures what the step CONSUMED, so a sweep can re-run the SAME turn under different levers.
 *
 * Written under the turn dir as `replay-set/`:
 *   pre-project/        , FULL project code tree BEFORE the agent ran (codeTreeFilter: app/tests/
 *                         migrations, NEVER .consort/junk) , the exact tree the turn starts from, so
 *                         the step replays without reconstructing it from prior turns. Agent turns are
 *                         the sole mutators of the project code tree (deploy/hooks touch only .consort
 *                         + pid), so a snapshot here is the complete code pre-state.
 *   inputs/<id>         , the resolved input CONTENTS the orchestrator handed the step (keyed by id).
 *   prompt.txt          , the FULLY ASSEMBLED prompt the agent saw (preconditions already inlined).
 *   guidelines.json     , the instruction guidelines (empty array when none).
 *   levers.json         , the RESOLVED agent levers (model/effort/session/toolScope) the turn ran
 *                         with , exactly what an optimization sweep varies.
 * `.consort` is NOT snapshotted here (it is delta-tracked every turn by recordTurn + the cumulative
 * recorded-artifacts mirror); the replay set is the CODE pre-state + the invocation conditions.
 * MUST be called BEFORE the agent mutates the tree (pre-state), from the record wrapper.
 */
export function recordReplaySet(args: {
  /** The turn's dir: `<recordDir>/turns/<NNNN>-<label>` (the SAME dir recordTurn will fill). */
  turnDir: string;
  projectDir: string;
  consortDir: string;
  /** Resolved input contents, keyed by logical input id (invocation.inputs). */
  inputs: Record<string, string>;
  /** The fully-assembled prompt the agent received (invocation.instructions.prompt). */
  prompt: string;
  /** Instruction guidelines, if any (invocation.instructions.guidelines). */
  guidelines?: string[];
  /** The resolved levers the turn ran with (model/effort/session/toolScope/...). */
  levers?: Record<string, unknown>;
}): void {
  const { turnDir, projectDir, consortDir, inputs, prompt, guidelines, levers } = args;
  const setDir = join(turnDir, "replay-set");
  mkdirSync(setDir, { recursive: true });

  // pre-project/ , the full code tree BEFORE the turn (codeTreeFilter excludes .consort + junk).
  const keep = codeTreeFilter(projectDir);
  const preDir = join(setDir, "pre-project");
  for (const abs of walk(projectDir, keep)) {
    const rel = relative(projectDir, abs);
    const dst = join(preDir, rel);
    mkdirSync(dirname(dst), { recursive: true });
    cpSync(abs, dst);
  }
  void consortDir; // .consort is delta-tracked by recordTurn, not snapshotted into the replay set.

  // inputs/<id> , the resolved contents handed to the step.
  const inDir = join(setDir, "inputs");
  mkdirSync(inDir, { recursive: true });
  for (const [id, content] of Object.entries(inputs)) {
    // ids are logical (e.g. "product-overview", "feature-request") , filesystem-safe already, but
    // guard a path separator so an id can never escape the inputs dir.
    writeFileSync(join(inDir, id.replace(/[/\\]/g, "_")), content);
  }

  // prompt.txt + guidelines.json + levers.json , the invocation conditions.
  writeFileSync(join(setDir, "prompt.txt"), prompt);
  writeFileSync(join(setDir, "guidelines.json"), JSON.stringify(guidelines ?? [], null, 2) + "\n");
  writeFileSync(join(setDir, "levers.json"), JSON.stringify(levers ?? {}, null, 2) + "\n");
}

/**
 * THE TEMPLATE: the files every AGENT turn (invoke-role, dispatched through the executor + record
 * wrapper) MUST have recorded, relative to its turn dir. This is the contract the per-turn audit
 * (assertTurnComplete) hard-fails on , so a turn that silently dropped an artifact (e.g. the
 * transcript double-consume bug) aborts the capture at that turn instead of corrupting the corpus.
 *
 * An agent turn's complete set:
 *   turn.json                     , the manifest (action + produced/deleted delta) , recordTurn
 *   files/                        , the OUTPUT delta (code + .consort) this turn produced , recordTurn
 *   transcript.md                 , the prompt + final reasoning + tools , recordTurn (from takeTranscript)
 *   replay-set/pre-project/       , the code pre-state , recordReplaySet
 *   replay-set/inputs/            , the resolved inputs , recordReplaySet
 *   replay-set/prompt.txt         , the assembled prompt , recordReplaySet
 *   replay-set/guidelines.json    , the guidelines , recordReplaySet
 *   replay-set/levers.json        , the resolved levers , recordReplaySet
 * A NON-agent turn (gate / dispatch / cut-experiment: no agent ran) requires only turn.json + files/.
 *
 * `liveCapture` scopes the FULL agent bundle (transcript.md + replay-set) to a LIVE capture. The same
 * wrapper also records REPLAY agents (corpus migration) + test doubles, which have no live transcript
 * and no meaningful pre-state , they legitimately lack the bundle, so a non-live record requires only
 * the base set (turn.json + files/) even for an invoke-role turn.
 */
export function expectedTurnFiles(action: WorkflowAction, opts: { liveCapture?: boolean } = {}): string[] {
  const base = ["turn.json", "files"];
  if (action.kind !== "invoke-role" || !opts.liveCapture) return base;
  return [
    ...base,
    "transcript.md",
    "replay-set/pre-project",
    "replay-set/inputs",
    "replay-set/prompt.txt",
    "replay-set/guidelines.json",
    "replay-set/levers.json",
  ];
}

/**
 * The PER-TURN AUDIT (hard-fail): after a turn is captured, assert EVERY file the template
 * (expectedTurnFiles) requires for this turn kind exists in its dir. Throws loud on the FIRST
 * missing one , naming the turn + the missing files , so a capture aborts at the defective turn
 * rather than silently producing an incomplete corpus (the failure mode that let 11/12 agent turns
 * record with no transcript.md unnoticed). Called at end-of-turn from the record wrapper.
 */
export function assertTurnComplete(turnDir: string, action: WorkflowAction, opts: { liveCapture?: boolean } = {}): void {
  const missing = expectedTurnFiles(action, opts).filter((rel) => !existsSync(join(turnDir, rel)));
  if (missing.length > 0) {
    throw new Error(
      `RECORD AUDIT FAILED , turn ${turnDir} (${labelForAction(action)}) is missing required recorded ` +
        `file(s): ${missing.join(", ")}. The capture is aborting so the corpus is not silently ` +
        `incomplete. Every ${action.kind === "invoke-role" ? "agent" : ""} turn must record its full set ` +
        `(see expectedTurnFiles). Fix the recorder path that dropped it, then re-capture.`,
    );
  }
}

/** Short, filesystem-safe label for a turn dir, derived from the action. */
export function labelForAction(action: WorkflowAction): string {
  const a = action as Record<string, unknown>;
  const kind = String(a.kind ?? "turn");
  if (kind === "invoke-role") {
    const role = String(a.role ?? "role");
    const mode = a.buildMode ?? a.mode;
    return mode ? `${role}-${mode}` : role;
  }
  if (kind === "approve-gate" || kind === "approve-plan-gate" || kind === "approve-promote-gate") {
    // approve-gate carries the per-story spec gate; the others name their gate.
    if (kind === "approve-plan-gate") return "gate-plan";
    if (kind === "approve-promote-gate") return "gate-promote";
    return "gate-spec";
  }
  if (kind === "approve-deploy-gate") return "gate-deploy";
  if (kind === "surface-gate") return "gate-surface";
  // cut-experiment, accept, deploy, prepare-pr, wait-ci, merge, dispatch,
  // feature-complete, deploy-complete, planning-complete, complete, ...
  return kind;
}

function sha1(abs: string): string {
  return createHash("sha1").update(readFileSync(abs)).digest("hex");
}

/** Render an agent turn's transcript as human-readable markdown for the
 *  demo/visualization: the prompt the role was dispatched with, the tools it
 *  used in order, and its final reasoning (the outcome). */
export function renderTranscriptMd(t: RecordedTranscript, label: string): string {
  const lines: string[] = [];
  lines.push(`# ${label}${t.role ? ` (${t.role})` : ""}${t.model ? ` , ${t.model}` : ""}`, "");
  lines.push("## Prompt", "", "```", t.prompt.trim() || "(empty)", "```", "");
  lines.push("## Tools used", "");
  if (t.tools.length === 0) {
    lines.push("(none)", "");
  } else {
    for (const tool of t.tools) lines.push(`- ${tool}`);
    lines.push("");
  }
  lines.push("## Final reasoning", "", t.finalText.trim() || "(no final assistant text)", "");
  return lines.join("\n");
}

/** Recursively list files under a dir, applying an optional path filter. */
function walk(dir: string, keep?: (abs: string) => boolean): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    if (keep && !keep(abs)) continue;
    let st;
    try {
      st = statSync(abs);
    } catch {
      continue;
    }
    if (st.isDirectory()) out.push(...walk(abs, keep));
    else if (st.isFile()) out.push(abs);
  }
  return out;
}

/** Scan the watched roots (.tdd in full + the code tree via codeTreeFilter) into
 *  a stable relpath->ScannedFile map. The code filter also excludes .tdd, so the
 *  two roots never double-count. */
function scan(projectDir: string, consortDir: string): Map<string, ScannedFile> {
  const map = new Map<string, ScannedFile>();
  // .tdd in full (minus the recorder's own append-only log).
  for (const abs of walk(consortDir)) {
    const rel = relative(projectDir, abs);
    if (NON_ARTIFACT_TDD.has(relative(consortDir, abs))) continue;
    map.set(rel, { abs, rel, underTdd: true, sha: sha1(abs) });
  }
  // The code tree (app/, tests/, alembic/, etc.) via the shared filter, which
  // skips scaffold-owned dirs (.tdd/.git/scripts/...), junk, and secrets.
  const keep = codeTreeFilter(projectDir);
  for (const abs of walk(projectDir, keep)) {
    const rel = relative(projectDir, abs);
    if (map.has(rel)) continue;
    map.set(rel, { abs, rel, underTdd: false, sha: sha1(abs) });
  }
  return map;
}

interface RecorderState {
  /** relpath -> sha at the end of the previous turn. */
  files: Record<string, string>;
}

function writeRecorderState(recordDir: string, cur: Map<string, ScannedFile>): void {
  const files: Record<string, string> = {};
  for (const [rel, f] of cur) files[rel] = f.sha;
  mkdirSync(recordDir, { recursive: true });
  writeFileSync(join(recordDir, ".recorder-state.json"), JSON.stringify({ files }, null, 2) + "\n");
}

/**
 * Seed the delta baseline with the CURRENT project state, once, before the first
 * turn is recorded , so turn 0's delta reports only what that turn produced, not
 * the pre-existing scaffold + intake files. A no-op if a baseline already exists
 * (e.g. a later drive process in the same run, which must keep the running state
 * from the prior process). Call at recorder construction, after scaffold/intake.
 */
export function seedRecorderBaseline(args: { recordDir: string; projectDir: string; consortDir: string }): boolean {
  if (existsSync(join(args.recordDir, ".recorder-state.json"))) return false;
  writeRecorderState(args.recordDir, scan(args.projectDir, args.consortDir));
  return true;
}

function readState(recordDir: string): RecorderState {
  const f = join(recordDir, ".recorder-state.json");
  if (!existsSync(f)) return { files: {} };
  try {
    return JSON.parse(readFileSync(f, "utf8")) as RecorderState;
  } catch {
    return { files: {} };
  }
}

interface IndexEntry {
  ordinal: number;
  step: number;
  label: string;
  kind: string;
  role?: string;
  mode?: string;
  story?: string;
  ac?: string;
  dir: string;
  producedCount: number;
  deletedCount: number;
  /** True when the turn recorded an agent transcript (transcript.md present). */
  hasTranscript?: boolean;
}

function readIndex(recordDir: string): IndexEntry[] {
  const f = join(recordDir, "turns", "index.json");
  if (!existsSync(f)) return [];
  try {
    const data = JSON.parse(readFileSync(f, "utf8")) as { turns?: IndexEntry[] };
    return Array.isArray(data.turns) ? data.turns : [];
  } catch {
    return [];
  }
}

function pad(n: number): string {
  return String(n).padStart(4, "0");
}

/**
 * The turn dir `recordTurn` WILL write for this action, computed the SAME way (next ordinal from the
 * on-disk index + labelForAction). Exported so the record wrapper can write the PRE-state replay set
 * (recordReplaySet) into the identical dir BEFORE recordTurn fills its output delta. Both read the
 * index at the same point (no turn appended yet between them), so the ordinals agree. Callers MUST
 * invoke recordReplaySet(turnDirFor(...)) then recordTurn(...) with no intervening index append.
 */
export function turnDirFor(recordDir: string, action: WorkflowAction): string {
  return join(recordDir, "turns", `${pad(readIndex(recordDir).length)}-${labelForAction(action)}`);
}

/**
 * Record one state-machine turn: write its manifest + the .tdd/code delta it
 * produced under turns/<NNNN>-<label>/, refresh the cumulative recorded-artifacts
 * .tdd mirror, and append to turns/index.json. The ordinal is monotonic across
 * the whole run (every drive process appends to the same on-disk index), so the
 * timeline is correct even though each feature/sprint is a separate process.
 */
export function recordTurn(args: RecordTurnArgs): RecordedTurn {
  const { recordDir, projectDir, consortDir, action, step, transcript } = args;
  const a = action as Record<string, unknown>;

  const prior = readState(recordDir);
  const cur = scan(projectDir, consortDir);

  const produced: string[] = [];
  for (const [rel, f] of cur) {
    if (prior.files[rel] !== f.sha) produced.push(rel);
  }
  const deleted: string[] = [];
  for (const rel of Object.keys(prior.files)) {
    if (!cur.has(rel)) deleted.push(rel);
  }
  produced.sort();
  deleted.sort();

  const ordinal = readIndex(recordDir).length;
  const label = labelForAction(action);
  const dirName = `${pad(ordinal)}-${label}`;
  const turnDir = join(recordDir, "turns", dirName);
  mkdirSync(join(turnDir, "files"), { recursive: true });

  const artifactsDir = join(recordDir, "recorded-artifacts");

  // Copy each produced file into the turn's delta, and mirror .tdd files into the
  // cumulative recorded-artifacts corpus (so replayDesignTurn reads it as-is).
  for (const rel of produced) {
    const f = cur.get(rel)!;
    const dst = join(turnDir, "files", rel);
    mkdirSync(dirname(dst), { recursive: true });
    cpSync(f.abs, dst);
    if (f.underTdd) {
      const mirror = join(artifactsDir, relative(consortDir, f.abs));
      mkdirSync(dirname(mirror), { recursive: true });
      cpSync(f.abs, mirror);
    }
  }
  // Remove cumulative-mirror entries for deleted .tdd files.
  for (const rel of deleted) {
    const abs = join(projectDir, rel);
    if (abs.startsWith(consortDir)) {
      const mirror = join(artifactsDir, relative(consortDir, abs));
      if (existsSync(mirror)) rmSync(mirror, { force: true });
    }
  }

  // Persist the agent turn's transcript (prompt + final reasoning + tool list)
  // as a human-readable transcript.md the demo/visualization renders, and a
  // compact summary in turn.json (hasTranscript + counts) so an index consumer
  // knows a transcript exists without reading it. Non-agent turns have none.
  let transcriptSummary: { role?: string; model?: string; toolCount: number; finalTextChars: number } | undefined;
  if (transcript) {
    writeFileSync(join(turnDir, "transcript.md"), renderTranscriptMd(transcript, label));
    transcriptSummary = {
      role: transcript.role,
      model: transcript.model,
      toolCount: transcript.tools.length,
      finalTextChars: transcript.finalText.length,
    };
  }

  const manifest = {
    ordinal,
    step,
    label,
    kind: String(a.kind ?? "turn"),
    role: a.role as string | undefined,
    mode: (a.buildMode ?? a.mode) as string | undefined,
    story: a.story as string | undefined,
    ac: a.ac as string | undefined,
    action,
    produced,
    deleted,
    ...(transcriptSummary ? { transcript: transcriptSummary } : {}),
  };
  writeFileSync(join(turnDir, "turn.json"), JSON.stringify(manifest, null, 2) + "\n");

  // Append to the ordered index.
  const index = readIndex(recordDir);
  const entry: IndexEntry = {
    ordinal,
    step,
    label,
    kind: manifest.kind,
    role: manifest.role,
    mode: manifest.mode,
    story: manifest.story,
    ac: manifest.ac,
    dir: dirName,
    producedCount: produced.length,
    deletedCount: deleted.length,
    ...(transcript ? { hasTranscript: true } : {}),
  };
  index.push(entry);
  mkdirSync(join(recordDir, "turns"), { recursive: true });
  writeFileSync(join(recordDir, "turns", "index.json"), JSON.stringify({ turns: index }, null, 2) + "\n");

  // Persist the new file-state for the next turn's delta.
  writeRecorderState(recordDir, cur);

  return { ordinal, dir: dirName, produced, deleted };
}
