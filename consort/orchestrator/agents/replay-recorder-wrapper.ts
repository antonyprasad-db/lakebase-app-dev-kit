// replay-recorder-wrapper: a StepAgent DECORATOR that records what a turn produced into a corpus
// , the mirror of the step-aware replay agent. Replay READS the corpus by step (makeStepReplayAgent);
// Record WRAPS whatever agent ran (claude live, contained, or even a replay for corpus migration),
// lets it produce its delta, then WRITES that delta + the recorded transcript into the corpus keyed
// by the step's action. Both sit on the ONE buildAgent seam: recording a NEW live scenario is just
// wrapping the live `claude` agent. Same corpus format out (turns/NNNN-<label>/{turn.json,files/} +
// recorded-build/.../turns/NNN), so a recorded run is directly replayable.
//
// It REUSES the existing corpus writers verbatim (recordTurn + recordBuildTurn), never reinventing
// them , the recorder is the single source of the corpus format, shared by the drive.cli effects
// wrappers and this decorator. The only difference is WHERE it fires: this wraps the agent's invoke()
// (so it's selected per-step via buildAgent), the effects wrappers wrap perform() (whole-turn).
//
// Baseline: recordTurn diffs the workspace against a delta baseline seeded once per corpus. The
// wrapper seeds it lazily on the first wrapped invoke (guarded), mirroring withTurnRecording.

import { seedRecorderBaseline, recordTurn, type RecordedTranscript } from "../../logging/turn-recorder.js";
import { recordBuildTurn, nextBuildTurnNumber } from "../../pipeline/record-build.js";
import type { StepAgent, AgentInvocation } from "./agent-types.js";
import type { WorkflowAction } from "../workflow/workflow-vocabulary.js";

/** What the recorder decorator needs from the run (the paths the corpus writers key on). */
export interface RecorderContext {
  /** LAKEBASE_SFTDD_RECORD_DIR , the corpus root the turns/ timeline is written under. */
  recordDir: string;
  /** LAKEBASE_SFTDD_RECORD_BUILD_DIR , the build-corpus root (recorded-build/); when set, a
   *  navigator/driver turn also snapshots its code tree there. Absent => design-only recording. */
  recordBuildDir?: string;
  /** The project working tree root. */
  projectDir: string;
  /** The project `.consort` dir. */
  consortDir: string;
  /** The feature id the run is building (the build corpus is feature-scoped). */
  featureId: string;
  /** OPTIONAL: capture the just-completed turn's transcript (prompt + final reasoning + tools) to
   *  persist alongside the delta. The live drive supplies takeLastAgentTranscript; a hermetic test
   *  omits it. */
  takeTranscript?: () => RecordedTranscript | undefined;
}

/**
 * Wrap a StepAgent so that, after the inner agent produces its turn's delta in the workspace, the
 * turn is RECORDED into the corpus: recordTurn writes turns/<NNNN>-<label>/{turn.json,files/} (the
 * step-aware replay agent's source), and , for a navigator/driver turn , recordBuildTurn snapshots
 * the code tree into recorded-build/. Keyed by the invocation's action, so the recorded corpus is
 * step-addressable. Reuses the recorder primitives verbatim.
 */
export function wrapWithRecorder(inner: StepAgent, ctx: RecorderContext): StepAgent {
  let seeded = false;

  // The wrapped invoke: pass the invocation THROUGH to the inner agent untouched, then record.
  const recordingInvoke = async (invocation: AgentInvocation): Promise<void> => {
      // Seed the delta baseline ONCE (lazily), so the first recorded turn reports only what it
      // produced, not the pre-existing scaffold. A no-op once a baseline exists (later turns / a
      // resumed run). Mirrors withTurnRecording's seed.
      if (!seeded) {
        seedRecorderBaseline({ recordDir: ctx.recordDir, projectDir: ctx.projectDir, consortDir: ctx.consortDir });
        seeded = true;
      }

      // Let the inner agent (live claude / contained / replay) produce its delta first. The
      // invocation is forwarded verbatim , the wrapper NEVER alters the inner agent's inputs.
      await inner.invoke(invocation);

      const action: WorkflowAction = invocation.action;
      const transcript = ctx.takeTranscript?.();

      // 1) The per-turn timeline slice (turns/NNNN-<label>/): the artifact + meta delta this turn
      //    produced, plus the transcript. This is exactly what makeStepReplayAgent reads back.
      recordTurn({
        recordDir: ctx.recordDir,
        projectDir: ctx.projectDir,
        consortDir: ctx.consortDir,
        action,
        step: 0,
        ...(transcript ? { transcript } : {}),
      });

      // 2) A navigator/driver turn ALSO snapshots its full code tree into the build corpus
      //    (recorded-build/.../turns/NNN), the per-story build-ordinal replayBuildTurn consumes.
      if (ctx.recordBuildDir && action.kind === "invoke-role" && (action.role === "navigator" || action.role === "driver") && "story" in action && typeof action.story === "string") {
        const turn = nextBuildTurnNumber(ctx.recordBuildDir, ctx.featureId, action.story);
        recordBuildTurn({
          recordBuildDir: ctx.recordBuildDir,
          projectDir: ctx.projectDir,
          consortDir: ctx.consortDir,
          featureId: ctx.featureId,
          story: action.story,
          turn,
          role: action.role,
          ...("ac" in action && typeof action.ac === "string" ? { ac: action.ac } : {}),
          ...("buildMode" in action && typeof action.buildMode === "string" ? { mode: action.buildMode } : {}),
        });
      }
  };

  // Return a TRUE PASS-THROUGH: every property/method of the inner agent is visible unchanged
  // (buildCommand, lastResult, sessionId, ...) so the executor + Step + manifest-runner read the
  // inner agent's telemetry (e.g. lastResult for the phase-6 record / recorded transcript) exactly
  // as if unwrapped. Only `invoke` is intercepted , to record after the inner turn produces its
  // delta. A Proxy (not an object spread) so live getters like `lastResult`, set DURING invoke,
  // reflect through to whoever reads them afterward.
  return new Proxy(inner, {
    get(target, prop, receiver) {
      if (prop === "invoke") return recordingInvoke;
      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
