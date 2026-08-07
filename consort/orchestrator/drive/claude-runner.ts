// The reusable drive spawn engine: buildCfg, execRunner, and their private
// helpers. Extracted from drive.cli.ts so that drive.cli.ts itself AND the
// optimize harness (bin/consort/optimize.cli.ts) can import the seams without
// dragging drive.cli's `main()`/isCliEntry CLI entry block into their bundle.
//
// CRITICAL: tsup has splitting:false, which inlines modules into a single bundle.
// A bundled isCliEntry block in an imported module would fire as a phantom side
// effect when consumed (e.g. when optimize.cli.js imports buildCfg), running the
// drive's main() and crashing with exit-3. This module has NO main() and NO
// isCliEntry, so importing it NEVER drags a CLI entry point.

import { spawn } from "node:child_process";
import { consortEnv } from "../../config/consort-env.js";
import { resyncAgentsOnKitDrift } from "../../setup/project-consort-setup.js";
import { resolveConsortDir } from "../../config/consort-paths.js";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";

import { replayDesignTurn, REPLAYABLE_DESIGN_ROLES, restoreReflectVerdict } from "../../logging/replay-artifacts.js";
import { replayBuildTurn } from "../../logging/replay-build.js";
import { recordBuildTurn, nextBuildTurnNumber } from "../../pipeline/record-build.js";
import { recordTurn, seedRecorderBaseline } from "../../logging/turn-recorder.js";
import { emitAgentLogEvent } from "../../logging/agent-log.js";
import { writeWorkflowPhase } from "../../gates/workflow-phase.js";
import {
  commandsForAction,
  type CommandRunner,
  type DriveCommand,
  type DriveEffectsConfig,
} from "./orchestrator-effects.js";
import { resolveModelForRole } from "../../config/agent-models.js";
import { resolveConsortSettings } from "../settings/project-settings.js";
import { parseTurnUsage, assistantTextFromLine, assistantEventSummary, type TurnUsage } from "../../session/claude-usage.js";
import { resumeFitsBudget, turnContextTokens, CONTEXT_FREE_FRACTION_REQUIRED, isPromptTooLongSignal, isTransientApiErrorSignal, startsFreshEachTurn } from "../../session/context-budget.js";
import { writeRunConfig } from "../../session/run-config.js";
import { resolveLaunchKitRef, pinRunKitRef, kitRefDriftWarning } from "../../config/kit-ref.js";
import type { AgentRole } from "../../logging/agent-log.js";
import { makeOnAction, describeAction } from "../../logging/orchestrator-logging.js";
import { resolveKitBinJs } from "../../config/kit-bin.js";
import { readWorkflowState } from "@databricks-solutions/lakebase-scm-utils/lakebase";
import { relocateStrayDesignArtifacts, malformedSiblingRoot } from "../../setup/stray-artifact-recovery.js";
import type { WorkflowAction } from "./orchestrator-drive.js";

// How many times a single role turn that overflows the model window mid-turn
// ("Prompt is too long") is retried on a FRESH session before the failure
// propagates. Each retry inherits the prior attempt's on-disk progress, so a
// small bound converges; it is a backstop, not a substitute for chunking work.
const MAX_PROMPT_TOO_LONG_RETRIES = 2;
// A transient API/network blip (connection dropped, overloaded, 5xx) is not the
// agent's or the workflow's fault; re-running the same turn a moment later
// usually succeeds. Retry more times than the context-overflow case (a blip is
// pure chance, so more attempts pay off) with exponential backoff, so one blip
// cannot kill a multi-hour unattended capture. Overridable for tests.
const MAX_TRANSIENT_RETRIES = Number(consortEnv("MAX_TRANSIENT_RETRIES") ?? "5");
const TRANSIENT_BACKOFF_MS = Number(consortEnv("TRANSIENT_BACKOFF_MS") ?? "5000");

export interface ParsedArgs {
  feature?: string;
  sprint?: string;
  projectDir?: string;
  consortDir?: string;
  instance?: string;
  deployTarget?: string;
  approver?: string;
  dryRun?: boolean;
  maxSteps?: number;
  planOnly?: boolean;
  only?: string;
  pauseBefore?: string;
  gates?: string;
  noSizing?: boolean;
  help?: boolean;
}

export function spawnCmd(bin: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd, stdio: "inherit" });
    child.on("error", (err) => reject(err));
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${bin} exited ${code}`))));
  });
}


/**
 * Spawn a `claude -p --output-format stream-json --verbose` turn, TEE the
 * human-readable assistant text to stderr (so the live console still shows the
 * agent working, not raw JSON), and return the turn's usage from the terminal
 * `result` event , the per-turn CONTEXT SIZE (input_tokens) + output + cache +
 * cost. stderr is inherited so claude's own errors surface. Usage parsing is
 * best-effort: a missing result event yields undefined (never breaks the turn).
 */
/** A claude turn that exited non-zero. `promptTooLong` flags the recoverable
 *  context-overflow case: the turn itself ballooned past the model window
 *  WITHIN the turn (many tool calls in one shot), the "Prompt is too long"
 *  failure the resume-time context guard cannot pre-empt. The runner retries
 *  this case on a FRESH session; any other non-zero exit is a hard failure. */
export class ClaudeTurnError extends Error {
  constructor(
    message: string,
    readonly promptTooLong: boolean,
    /** The turn's output matched a transient API/network failure (connection
     *  dropped, overloaded, rate-limited, 5xx), so re-running it may succeed. */
    readonly transient = false,
  ) {
    super(message);
    this.name = "ClaudeTurnError";
  }
}

/** A replay lane (LAKEBASE_SFTDD_REPLAY_DIR / _REPLAY_BUILD_DIR) was told to
 *  reproduce a turn the corpus has no artifact for. A replay is a RECORDING: it
 *  must never fall through to a live agent (that would let an agent "take over"
 *  a run meant to be deterministic, and silently mask a broken/incomplete
 *  corpus). So a miss is a hard, loud failure that names the missing artifact.
 *  Almost always the corpus is missing a file (e.g. a `.gitignore` glob dropped
 *  it) , put the artifact in the right place, do not run the model. */
export class ReplayCorpusMissError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReplayCorpusMissError";
  }
}

/** FEIP-8006: a role turn completed but its expected artifact never landed under
 *  the project's `.sftdd/`. The subagent almost always resolved the project root
 *  wrong and wrote outside it (e.g. `$HOME/<somewhere>`), so a downstream
 *  consuming effect would otherwise crash reading the absent file, with a cryptic,
 *  MISATTRIBUTED error that blames the wrong step. We fail loud + attributed at the
 *  producing role instead, naming the role, the artifact, and where we looked. */
export class ArtifactOutOfRootError extends Error {
  constructor(
    readonly role: string,
    readonly label: string,
    readonly anyOf: string[],
    readonly consortDir: string,
    /** FEIP-8038: the known malformed-sibling root we also checked (+ tried to
     *  relocate from). Named so the human knows exactly where to look. */
    readonly checkedSibling?: string,
  ) {
    super(
      `role '${role}' produced no ${label} under ${path.basename(consortDir)}/ ` +
        `(expected one of: ${anyOf.join(", ")}).\n` +
        `        The subagent likely resolved the project root wrong and wrote outside it. ` +
        (checkedSibling
          ? `Checked (and tried to relocate from) the malformed sibling ${checkedSibling}; nothing there either. `
          : `(check $HOME and other dirs for a stray copy). `) +
        `Nothing downstream can consume the absent artifact. Re-run to re-dispatch the role.`,
    );
    this.name = "ArtifactOutOfRootError";
  }
}

/** The prompt + final reasoning + tool list captured from ONE agent turn, for
 *  the recorder to persist (demo transcript). Not the raw stream (that includes
 *  every interstitial "let me check" delta); just the outcome-level trace. */
export interface TurnTranscript {
  /** The task prompt the agent was dispatched with (`claude -p <task>`). */
  prompt: string;
  role?: string;
  model?: string;
  /** The turn's FINAL assistant text (the outcome/rationale). */
  finalText: string;
  /** Each tool action in order (name + a clipped target), as they streamed. */
  tools: string[];
}

/** Set by spawnClaudeStreaming on each turn's close; read + cleared by the
 *  recorder wrapper (withTurnRecording) so it lands in that turn's dir. Module-
 *  level for the same reason `sessions`/`sessionContext` are: the spawn and the
 *  record wrapper are separated by the effects boundary. */
let lastAgentTranscript: TurnTranscript | undefined;
export function takeLastAgentTranscript(): TurnTranscript | undefined {
  const t = lastAgentTranscript;
  lastAgentTranscript = undefined;
  return t;
}

export function spawnClaudeStreaming(args: string[], cwd: string): Promise<TurnUsage | undefined> {
  return new Promise((resolve, reject) => {
    // Capture BOTH stdout (the stream-json events) and stderr (claude's own
    // errors), teeing the human-readable parts to the console, so a context-
    // overflow message printed to either stream is detectable for the retry.
    const child = spawn("claude", args, { cwd, stdio: ["inherit", "pipe", "pipe"] });
    const lines: string[] = [];
    let sawTooLong = false;
    let sawTransient = false;
    // Tee a COMPACT trace: each tool action (liveness) as it streams, and the
    // turn's FINAL assistant text (the outcome) at close. The interstitial
    // "now I'll... / let me check..." prose is buffered and overwritten, so only
    // the last text (the result line) survives , the deliberation never hits the
    // log. Set LAKEBASE_SFTDD_VERBOSE_AGENT=1 to tee every assistant text delta.
    const verboseAgent = !!consortEnv("VERBOSE_AGENT");
    let lastText = "";
    const allTools: string[] = []; // accumulate for the recorded transcript
    const rl = readline.createInterface({ input: child.stdout! });
    rl.on("line", (line) => {
      lines.push(line);
      if (isPromptTooLongSignal(line)) sawTooLong = true;
      if (isTransientApiErrorSignal(line)) sawTransient = true;
      if (verboseAgent) {
        const text = assistantTextFromLine(line);
        if (text) process.stderr.write(text);
        // still collect tools for the transcript even in verbose mode
        for (const t of assistantEventSummary(line).tools) allTools.push(t);
        return;
      }
      const { text, tools } = assistantEventSummary(line);
      for (const t of tools) {
        process.stderr.write(`  · ${t}\n`);
        allTools.push(t);
      }
      if (text) lastText = text; // hold; only the final one is printed at close
    });
    const erl = readline.createInterface({ input: child.stderr! });
    erl.on("line", (line) => {
      if (isPromptTooLongSignal(line)) sawTooLong = true;
      if (isTransientApiErrorSignal(line)) sawTransient = true;
      process.stderr.write(`${line}\n`); // tee: keep claude's own errors visible
    });
    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      rl.close();
      erl.close();
      // The turn's final assistant text = the outcome (rule 5). Print it once,
      // after the tool trace, so the log shows actions + result, not the prose.
      if (!verboseAgent && lastText) process.stderr.write(`${lastText}\n`);
      if (code !== 0) return reject(new ClaudeTurnError(`claude exited ${code}`, sawTooLong, sawTransient));
      // Stash this turn's outcome-level transcript for the recorder. `-p <task>`
      // and `--agent <role>` / `--model <m>` are positional in the args we built.
      const pIdx = args.indexOf("-p");
      const rIdx = args.indexOf("--agent");
      const mIdx = args.indexOf("--model");
      lastAgentTranscript = {
        prompt: pIdx >= 0 ? args[pIdx + 1] ?? "" : "",
        role: rIdx >= 0 ? args[rIdx + 1] : undefined,
        model: mIdx >= 0 ? args[mIdx + 1] : undefined,
        finalText: lastText,
        tools: allTools,
      };
      resolve(parseTurnUsage(lines));
    });
  });
}

/**
 * The spawn flags for a claude command's optional tool-scope levers (the
 * optimize harness's Family-2 "restrict what the agent can scan/do" knob). A
 * pure function of the command so it is hermetically testable and has ONE
 * source of truth. Empty (both fields absent or empty) => `[]`, so a normal
 * drive command (which sets neither) spawns byte-identically to before.
 */
export function claudeToolArgs(cmd: Extract<DriveCommand, { kind: "claude" }>): string[] {
  const out: string[] = [];
  if (cmd.allowedTools && cmd.allowedTools.length) out.push("--allowed-tools", cmd.allowedTools.join(","));
  if (cmd.disallowedTools && cmd.disallowedTools.length) out.push("--disallowed-tools", cmd.disallowedTools.join(","));
  return out;
}

/**
 * The base `claude -p` spawn args for a role turn. Pure + exported so the flag set
 * is guardable. Headless essentials: -p (print), --agent/--model, --strict-mcp-config,
 * stream-json + --verbose (to capture turn.usage while teeing text).
 *
 * --setting-sources project is LOAD-BEARING: headless `claude -p` does NOT load a
 * directory's project settings (incl. its `.claude/agents/*.md` role definitions) by
 * default, so `--agent <role>` fails with "agent not found" unless project settings are
 * explicitly sourced. The kit's role agents live at `<projectDir>/.claude/agents/`
 * (laid down by the scaffolder's deployClaudeAgents, or into a throwaway workspace for a
 * lean live run); `--setting-sources project` is what makes `--agent spec-author` /
 * `--agent ux-designer` / ... resolve. (Verified: the child init event's `agents` list
 * includes the role only when this flag + the .claude/agents file are both present.)
 *
 * --permission-mode acceptEdits is LOAD-BEARING: a scaffolded project ships no
 * .claude/settings.json, so without an explicit mode a headless role agent DEFAULTS
 * TO PROMPTING , and there is no one to answer. A role agent must both WRITE its
 * artifact (feature-spec.json, story stubs, code) AND RUN kit CLIs (its self-check
 * `consort-response-formatter`, the cycle stamps); acceptEdits auto-accepts
 * both headlessly (verified: Write-tool AND Bash writes land with permission_denials
 * empty and is_error false).
 *
 * Why acceptEdits and NOT bypassPermissions: an enterprise managed-settings policy
 * (/Library/Application Support/ClaudeCode/managed-settings.json) sets
 * `permissions.disableBypassPermissionsMode: "disable"`. When that policy is present,
 * a spawned `claude -p --permission-mode bypassPermissions` is SILENTLY DOWNGRADED to
 * `default` (the child session's init event reports permissionMode "default"), which
 * then auto-DENIES every headless prompt , the exact opposite of what we want. So
 * bypassPermissions is not a stronger acceptEdits in this environment; it is broken.
 * acceptEdits is the strongest mode the policy honors, and it is sufficient. SCOPED to
 * the throwaway, isolated, scaffolded project the drive runs in , this spawns each
 * role agent autonomous within that project, not the operator's session.
 */
export function claudeBaseArgs(cmd: Extract<DriveCommand, { kind: "claude" }>): string[] {
  return [
    "-p", cmd.task,
    "--agent", cmd.role,
    "--model", cmd.model,
    "--permission-mode", "acceptEdits",
    "--setting-sources", "project",
    "--strict-mcp-config",
    "--output-format", "stream-json",
    "--verbose",
  ];
}

export function execRunner(cfg: DriveEffectsConfig): CommandRunner {
  // Per-role Claude session ids, scoped to this runner (one feature drive). A
  // role's first invocation creates a session (--session-id); later invocations
  // resume it (--resume) so the agent's context + prompt cache stay warm instead
  // of a cold respawn per story/cycle. Resume is an optimization layered on top
  // of the artifact-as-API contract: each role still reads/writes its artifacts,
  // so correctness never depends on the retained session, only speed.
  const sessions = new Map<string, string>();
  // Per-resumeKey running CONTEXT SIZE (the last turn's total prompt tokens:
  // input + cache + the response it added). The context-budget guard reads this
  // to decide whether a RESUME would blow the model window; a fresh session
  // resets it. Keeps the warm-resume optimization while never starting a turn
  // that cannot fit, the "Prompt is too long" failure that killed F5.
  const sessionContext = new Map<string, number>();
  // Per-story Navigator/Driver turn ordinal, for per-turn build replay: the Kth
  // build turn of this story maps to the Kth recorded turn dir in the corpus.
  const buildTurns = new Map<string, number>();
  return {
    async run(cmd: DriveCommand) {
      if (cmd.kind === "set-phase") {
        // Stamp the phase's owning feature (FEIP-8022): the phase slot is
        // per-project, so an un-owned phase leaks to the next feature. featureId
        // is "" for sprint planning (no owner stamped).
        writeWorkflowPhase(cfg.consortDir, cmd.phase, cfg.featureId || undefined);
        return;
      }
      if (cmd.kind === "sync-backlog") {
        // Deterministic, in-process (no CLI): project backlog.json from the
        // PO's committed feature-requests + the Architect's estimates.
        // (This is handled by imported orchestrator-effects module)
        return;
      }
      if (cmd.kind === "claude") {
        // Per-turn BUILD replay: when LAKEBASE_SFTDD_REPLAY_BUILD_DIR is set, a
        // Navigator/Driver turn overlays its recorded artifact (code + cycle/
        // experiment records) from the corpus instead of spawning the model. The
        // orchestrator still VISITS the turn (logs + transitions + runs the live
        // cycle-record CLIs that stamp RED/GREEN against the overlaid code), so
        // every Navigator<->Driver event is reproduced , only the artifact
        // delivery is mocked. The Kth Navigator/Driver turn maps to the Kth
        // recorded turn dir. A replay is a RECORDING: a corpus miss is a HARD
        // FAILURE (ReplayCorpusMissError), never a fall-through to a live agent ,
        // an agent taking over would defeat the deterministic reproduction and
        // silently mask an incomplete corpus.
        const replayBuildDir = consortEnv("REPLAY_BUILD_DIR");
        const story = cmd.replay?.story;
        if (replayBuildDir && story && (cmd.role === "navigator" || cmd.role === "driver")) {
          // The reflect turn is a DESIGN GATE that runs in the build lane: its only
          // output is reflect-verdict.json (a .sftdd artifact), never code. Restore
          // JUST the verdict , do NOT restore its recorded code snapshot (that would
          // overwrite the freshly-scaffolded tree with the recording's project-name-
          // baked files and leave it dirty, so the pre-build cut-experiment fork
          // refuses) , and do NOT count it as a build turn (replayBuildTurn's index
          // skips reflect turns, so RED maps to the first real recorded build turn).
          if (cmd.replay?.buildMode === "reflect") {
            const rd = consortEnv("REPLAY_DIR");
            // The verdict lives in the DESIGN corpus. When it is present (REPLAY_DIR
            // set), it MUST restore; a miss is a corpus defect, not a reason to run
            // the Navigator live. (When REPLAY_DIR is unset the design lane is not
            // being replayed, so there is no recorded verdict to restore here.)
            if (rd) {
              const restored = restoreReflectVerdict({ replayDir: rd, consortDir: cfg.consortDir, featureId: cfg.featureId, story });
              if (!restored) {
                throw new ReplayCorpusMissError(
                  `[drive] REPLAY CORPUS MISS: reflect verdict for ${story} is not in the corpus ` +
                    `(expected features/${cfg.featureId}/stories/${story}/reflect-verdict.json under ${rd}). ` +
                    `Replay will NOT run the Navigator live , put the recorded verdict in the corpus (check .gitignore is not dropping it).`,
                );
              }
            }
            process.stderr.write(`[drive] replayed reflect (navigator ${story}) from corpus , verdict only (no code, not counted)\n`);
            return;
          }
          const turnIndex = (buildTurns.get(story) ?? 0) + 1;
          buildTurns.set(story, turnIndex);
          const replayed = replayBuildTurn({
            replayBuildDir,
            projectDir: cfg.projectDir,
            consortDir: cfg.consortDir,
            featureId: cfg.featureId,
            story,
            turnIndex,
          });
          if (replayed) {
            process.stderr.write(
              `[drive] replayed build turn ${turnIndex} (${cmd.role}${cmd.replay?.mode ? `/${cmd.replay.mode}` : ""} ${story}) from corpus (no model spawn)\n`,
            );
            return;
          }
          throw new ReplayCorpusMissError(
            `[drive] REPLAY CORPUS MISS: build turn ${turnIndex} for ${story} (${cmd.role}) has no recorded turn dir under ` +
              `${replayBuildDir} (features/${cfg.featureId}/stories/${story}/turns). The live orchestrator dispatched more ` +
              `build turns than the corpus recorded, or the corpus is incomplete. Replay will NOT run the agent live , ` +
              `re-record or fix the corpus so it covers every dispatched turn.`,
          );
        }
        // Fast-forward replay: when LAKEBASE_SFTDD_REPLAY_DIR is set, a design-lane
        // role's turn copies its recorded output from the corpus instead of
        // spawning the model. The orchestrator still VISITS the turn (logs +
        // transitions + runs its deterministic effects); only the LLM generation
        // is replaced. Navigator/Driver are never replayed (not design roles),
        // so the real TDD begins at the Navigator handoff. A replay is a RECORDING:
        // if the deterministic pipeline dispatched a replayable design turn, the
        // corpus MUST have its artifact , a miss is a HARD FAILURE, never a
        // fall-through to a live agent (the .gitignore corpus drop this guards).
        const replayDir = consortEnv("REPLAY_DIR");
        if (replayDir && REPLAYABLE_DESIGN_ROLES.has(cmd.role)) {
          const replayed = replayDesignTurn({
            turn: { role: cmd.role, mode: cmd.replay?.mode, story: cmd.replay?.story },
            replayDir,
            consortDir: cfg.consortDir,
            featureId: cfg.featureId,
          });
          if (replayed) {
            process.stderr.write(
              `[drive] replayed ${cmd.role}${cmd.replay?.mode ? `/${cmd.replay.mode}` : ""}${cmd.replay?.story ? ` ${cmd.replay.story}` : ""} from corpus (no model spawn)\n`,
            );
            return;
          }
          const where = `${cmd.role}${cmd.replay?.mode ? `/${cmd.replay.mode}` : ""}${cmd.replay?.story ? ` ${cmd.replay.story}` : ""}`;
          throw new ReplayCorpusMissError(
            `[drive] REPLAY CORPUS MISS: no recorded artifact for design turn '${where}' under ${replayDir} ` +
              `(features/${cfg.featureId}/...). The deterministic pipeline dispatched this turn but the corpus lacks its ` +
              `output. Replay will NOT run the agent live , put the recorded artifact in the corpus (check .gitignore is not dropping it).`,
          );
        }
        // stream-json (requires --verbose with --print) lets us capture the turn's
        // token usage from the result event while teeing readable text to the console.
        const baseArgs = claudeBaseArgs(cmd);
        // Per-role/turn model-side knobs (sftdd-config.json): effort (set on judgment
        // turns to run fast), fallback model (auto-failover when the primary is
        // overloaded), and a per-invocation dollar cap.
        if (cmd.effort) baseArgs.push("--effort", cmd.effort);
        if (cmd.fallbackModel) baseArgs.push("--fallback-model", cmd.fallbackModel);
        if (typeof cmd.maxBudgetUsd === "number") baseArgs.push("--max-budget-usd", String(cmd.maxBudgetUsd));
        // Optional tool-scope restriction (optimize harness Family-2 lever). A
        // normal drive sets neither field, so this is a no-op there.
        baseArgs.push(...claudeToolArgs(cmd));
        // Resolve this attempt's session flags. `forceFresh` ignores the warm
        // session (used when retrying after a mid-turn "Prompt is too long").
        const sessionArgsFor = (forceFresh: boolean): string[] => {
          if (!cmd.resumeKey) return [];
          // Proactive per-turn context cap: a HEAVY role (Driver/Navigator) starts
          // EVERY turn on a fresh session, so no turn inherits a prior turn's
          // accumulated context. This is the deterministic companion to the reactive
          // budget guard below (which only resets AFTER a session already grew too
          // big). Artifact-as-API makes a cold turn always correct: the turn reloads
          // exactly what it needs from disk. Overridable via LAKEBASE_SFTDD_HEAVY_ROLES.
          if (startsFreshEachTurn(cmd.role)) {
            const id = randomUUID();
            sessions.set(cmd.resumeKey, id);
            sessionContext.delete(cmd.resumeKey);
            return ["--session-id", id];
          }
          const existing = sessions.get(cmd.resumeKey);
          // Context-budget guard: only resume when the warm session still leaves
          // >= the required free fraction of the model window; otherwise the turn
          // would risk "Prompt is too long". When it would not fit (or we are
          // forcing fresh after a mid-turn overflow), start FRESH (new session-id,
          // reset the tracked size) instead of failing the turn.
          const priorCtx = sessionContext.get(cmd.resumeKey) ?? 0;
          const wouldFit = !forceFresh && resumeFitsBudget(priorCtx, cmd.model);
          if (existing && wouldFit) return ["--resume", existing];
          if (existing && !forceFresh && !wouldFit) {
            process.stderr.write(
              `[drive] context guard: fresh ${cmd.role} session ` +
                `(warm ~${priorCtx.toLocaleString()} tok < ${Math.round(CONTEXT_FREE_FRACTION_REQUIRED * 100)}% of ${cmd.model} window free)\n`,
            );
          }
          const id = randomUUID();
          sessions.set(cmd.resumeKey, id);
          sessionContext.delete(cmd.resumeKey);
          return ["--session-id", id];
        };
        // Spawn with a bounded retry on a MID-TURN context overflow. The resume-time
        // guard above cannot pre-empt a turn that balloons WITHIN itself (one shot,
        // many tool calls , the failure that killed F6/S3-split-drop-old). When that
        // turn fails with "Prompt is too long", restart it on a FRESH session: the
        // artifacts the failed attempt already wrote (.sftdd + code + tests) persist,
        // so each retry has strictly less to do and converges, instead of aborting
        // the whole drive. A non-overflow failure (or exhausted retries) still throws.
        let usage: TurnUsage | undefined;
        const turnStart = Date.now();
        // Two independent bounded retry budgets on a failed turn: a mid-turn
        // context overflow (retry on a FRESH session, converges as artifacts
        // persist) and a TRANSIENT API/network blip (retry the same session after
        // a backoff). A blip must never hard-halt a long unattended capture; an
        // auth failure is deliberately not transient, so it still surfaces.
        let overflowRetries = 0;
        let transientRetries = 0;
        for (;;) {
          const args = [...baseArgs, ...sessionArgsFor(overflowRetries > 0)];
          try {
            usage = await spawnClaudeStreaming(args, cfg.projectDir);
            break;
          } catch (e) {
            if (e instanceof ClaudeTurnError && e.promptTooLong && overflowRetries < MAX_PROMPT_TOO_LONG_RETRIES) {
              overflowRetries++;
              process.stderr.write(
                `[drive] context guard (mid-turn): ${cmd.role} overflowed ${cmd.model}; ` +
                  `fresh-session retry ${overflowRetries}/${MAX_PROMPT_TOO_LONG_RETRIES}\n`,
              );
              continue;
            }
            if (e instanceof ClaudeTurnError && e.transient && transientRetries < MAX_TRANSIENT_RETRIES) {
              transientRetries++;
              const backoff = TRANSIENT_BACKOFF_MS * transientRetries;
              process.stderr.write(
                `[drive] transient API error on ${cmd.role} (${cmd.model}); ` +
                  `retry ${transientRetries}/${MAX_TRANSIENT_RETRIES} after ${(backoff / 1000).toFixed(0)}s\n`,
              );
              await new Promise((r) => setTimeout(r, backoff));
              continue;
            }
            throw e;
          }
        }
        // Log the turn's CONTEXT SIZE + usage right after it returns (role + model
        // + effort after role; the token counts in metadata). Best-effort: never
        // let a logging hiccup break the turn.
        const turnMs = Date.now() - turnStart;
        if (usage) {
          // Record this turn's total context so the next resume decision for this
          // session can apply the context-budget guard above.
          if (cmd.resumeKey) sessionContext.set(cmd.resumeKey, turnContextTokens(usage));
          // Wall-clock per turn: the missing signal for perf work. Emitted on the
          // turn.usage event (+ a terse console line) so a run's log shows WHERE the
          // seconds go (which role/turn) instead of guessing.
          process.stderr.write(`[drive] ${cmd.role} turn ${(turnMs / 1000).toFixed(1)}s (${cmd.model})\n`);
          try {
            emitAgentLogEvent(
              {
                role: cmd.role as AgentRole,
                level: "info",
                event: "turn.usage",
                model: cmd.model,
                ...(cmd.effort ? { effort: cmd.effort } : {}),
                feature_id: cfg.featureId,
                slots: {
                  duration_ms: turnMs,
                  input_tokens: usage.inputTokens,
                  output_tokens: usage.outputTokens,
                  ...(usage.cacheReadTokens !== undefined ? { cache_read_tokens: usage.cacheReadTokens } : {}),
                  ...(usage.cacheCreationTokens !== undefined ? { cache_creation_tokens: usage.cacheCreationTokens } : {}),
                  ...(usage.costUsd !== undefined ? { cost_usd: usage.costUsd } : {}),
                  ...(cmd.replay?.story ? { story: cmd.replay.story } : {}),
                  ...(cmd.replay?.mode ? { phase: cmd.replay.mode } : {}),
                },
              },
              { consortDir: cfg.consortDir },
            );
          } catch {
            /* usage logging is observability, never load-bearing */
          }
        }
        return;
      }
      if (cmd.kind === "verify-artifact") {
        // FEIP-8006 out-of-root guard: the role's expected artifact must exist
        // UNDER the project's consortDir (a file, or a non-empty dir for per-story
        // ACs). A subagent that resolved the project root wrong wrote it elsewhere;
        // fail loud + attributed HERE, before a downstream effect consumes the
        // absent artifact and crashes with a cryptic, misattributed error.
        const isPresent = (): boolean =>
          cmd.anyOf.some((p) => {
            try {
              const st = fs.statSync(p);
              return st.isDirectory() ? fs.readdirSync(p).length > 0 : true;
            } catch {
              return false;
            }
          });
        if (!isPresent()) {
          // FEIP-8038: a subagent may have resolved a MALFORMED project root
          // (parent + project hyphen-joined) and written the artifact to that
          // sibling. Relocate a stray .sftdd/.tdd tree from it into the real root
          // and re-check, so the run self-heals instead of deadlocking on the
          // "re-run" remedy (which no-ops , the artifact never lands in-root).
          const strayFix = relocateStrayDesignArtifacts(cfg.projectDir);
          if (strayFix.relocated) {
            process.stderr.write(
              `[drive] recovered ${strayFix.moved.length} stray artifact(s) from a malformed root ` +
                `(${strayFix.from}) into the project root (FEIP-8038)\n`,
            );
          }
          if (!isPresent()) {
            throw new ArtifactOutOfRootError(
              cmd.role,
              cmd.label,
              cmd.anyOf,
              cfg.consortDir,
              malformedSiblingRoot(cfg.projectDir),
            );
          }
        }
        return;
      }
      // cmd.kind === "cli": resolve the kit bin to its dist JS via the kit's
      // package.json bin map so it runs regardless of PATH; fall back to the
      // bare name for anything not a kit bin (external tools on PATH).
      const js = resolveKitBinJs(cmd.bin);
      if (js) {
        await spawnCmd("node", [js, ...cmd.args], cfg.projectDir);
      } else {
        await spawnCmd(cmd.bin, cmd.args, cfg.projectDir);
      }
    },
  };
}

let agentResyncDone = false;
/** Run the version-aware agent refresh at most once per drive process, and
 *  never during capture/replay (it mutates the tree; a recorded corpus must
 *  stay a pure product of its turns). Best-effort , resyncAgentsOnKitDrift
 *  swallows its own errors. */
function maybeResyncAgents(projectDir: string): void {
  if (agentResyncDone) return;
  agentResyncDone = true;
  const recordingOrReplaying =
    !!consortEnv("REPLAY_DIR") ||
    !!consortEnv("REPLAY_BUILD_DIR") ||
    !!consortEnv("RECORD_BUILD_DIR") ||
    !!consortEnv("RECORD_DIR");
  if (recordingOrReplaying) return;
  const r = resyncAgentsOnKitDrift(projectDir);
  if (r.refreshed) {
    process.stderr.write(`[drive] kit moved (${r.from ?? "unknown"} -> ${r.to}); refreshed .claude/agents/ from the kit\n`);
  }
}

/** Build a DriveEffectsConfig for a feature (or planning, featureId ""). */
export function buildCfg(args: ParsedArgs, featureId: string): DriveEffectsConfig {
  const projectDir = args.projectDir ?? process.cwd();
  const consortDir = args.consortDir ?? resolveConsortDir(projectDir);
  // Version-aware agent refresh: if the kit moved since this project last synced
  // its .claude/agents/, force-refresh them so a role-prompt bugfix reaches the
  // project (create-time copyMissingMd only seeds missing files). Once per drive
  // process, best-effort, and NEVER during capture/replay (it mutates the tree
  // and would pollute a recorded corpus).
  maybeResyncAgents(projectDir);
  // Resolve the Lakebase instance + the feature's branch from the SCM workflow
  // state (.lakebase/workflow-state.json, written at claim). The per-story
  // experiment ops need both: the instance to create/merge the paired branch,
  // and the feature branch as the experiment's parent + merge target. --instance
  // overrides the recorded project_id when given.
  const scm = readWorkflowState(projectDir);
  // Unified config: one resolution of the per-role/turn model+effort matrix + the
  // build/plan/project knobs (sftdd-config.json -> LAKEBASE_SFTDD_* env -> default).
  const settings = resolveConsortSettings({ projectDir });
  return {
    projectDir,
    consortDir,
    featureId,
    sprintName: args.sprint,
    // Recorded feature-requests present (capture/replay) => the planning PROPOSE
    // step is deterministic (project feature-proposals.md from them) instead of an
    // LLM spawn. Unset (interactive) keeps the live Spec Author propose turn.
    recordedRequests: !!consortEnv("SPRINT_REQUESTS")?.trim(),
    // Force a LIVE propose even with recorded requests (capture exercising the
    // full plan lane): the Spec Author proposes from product-overview + nfrs,
    // the proxy still commits the recorded request at author-requests.
    livePropose: !!consortEnv("LIVE_PROPOSE")?.trim(),
    // Agent turns dispatch THROUGH the StepExecutor (the unified path) , now the DEFAULT (J1). Every
    // executor-allowlisted action has a shipped manifest (guarded by executor-dispatch-coverage.test),
    // so the executor is the sole agent path. LAKEBASE_SFTDD_USE_MANIFEST_STEPS is a one-cycle escape
    // hatch: set it to 0/false/off/no to force the legacy commandsForAction dispatch (retired in J5).
    useManifestSteps: !/^(0|false|off|no)$/i.test(consortEnv("USE_MANIFEST_STEPS")?.trim() ?? ""),
    // RECORD lane (Stage G): hand the executor's ReplayRecorderWrapper the just-completed live
    // turn's transcript, so an executor-dispatched turn records prompt + reasoning + tools alongside
    // its delta , the SAME source the effects-level withTurnRecording uses. Colocated with
    // takeLastAgentTranscript (this module) so there's no runtime edge from the executor onto the
    // runner. The recorder only reads it when RECORD_DIR is set; a normal drive never calls it.
    takeTranscript: takeLastAgentTranscript,
    instance: args.instance ?? scm?.project_id,
    featureBranch: scm?.branch,
    parentBranch: scm?.parent_branch,
    // Deploy target from the config (the --deploy-target flag wrote through to it).
    deployTarget: settings.project.deployTarget,
    approver: args.approver ?? "human-proxy",
    // UI track: the config (project.uiTrack, the single source) decides whether the
    // Spec Author frames user-facing capabilities as E2E (browser/screen) stories vs API-only.
    uiTrack: settings.project.uiTrack,
    // P5: Navigator/Driver session scope (story warm-resume vs cycle cold-spawn).
    buildSessionScope: settings.build.sessionScope,
    // P6 (back-compat): the navigator REVIEW turn's effort, still surfaced for
    // run-config + any caller without effortForTurn. effortForTurn (below) is the
    // primary, per-role/turn resolver and supersedes this.
    reviewEffort: ((): string => {
      const e = settings.effortFor("navigator", "review");
      return e === "default" ? "" : e;
    })(),
    // P8b: build loop granularity + batch cap (config / env).
    loopGranularity: settings.build.loopGranularity,
    batchCap: settings.build.batchCap,
    // Unified per-role/turn model-side resolvers ("" => omit --effort).
    effortForTurn: (role, turn) => {
      const e = settings.effortFor(role, turn);
      return e === "default" ? "" : e;
    },
    fallbackModelForRole: (role) => settings.fallbackModels[role],
    maxBudgetUsdForRole: (role) => settings.budgets[role],
    modelForRole: (role) => settings.models[role] ?? resolveModelForRole(role as AgentRole, projectDir),
    // Model tiering: per-turn model (driver GREEN/REFACTOR on a cheaper model than
    // its RED). Falls through to the role's base model when no per-turn map applies.
    modelForTurn: (role, turn) => settings.modelFor(role, turn),
    runner: { async run() {} },
    onAction: composeOnAction(
      // Narrate each routing decision in plain language (DRY: the same message
      // the structured log uses). The machine-readable form is already written to
      // the structured agent-log by makeOnAction below, so the raw action JSON is
      // console noise on every line , append it only under LAKEBASE_SFTDD_TRACE.
      (action, i) => {
        const trace = consortEnv("TRACE") ? `  ${JSON.stringify(action)}` : "";
        process.stderr.write(`[drive] ${String(i).padStart(3, "0")} ${describeAction(action, { featureId })}${trace}\n`);
      },
      // Code-emit the orchestrator's lifecycle (handoff / phase.start /
      // gate.surfaced / experiment.* / phase.end) through the ONE common logger,
      // so the structured trail is written every run with no LLM in the loop.
      // The resolvers stamp each per-turn phase.start with the model + effort it
      // ran with (right after `role`).
      makeOnAction({
        consortDir,
        featureId,
        modelForRole: (role) => settings.models[role],
        effortForTurn: (role, turn) => {
          const e = settings.effortFor(role, turn);
          return e === "default" ? "" : e;
        },
      }),
    ),
  };
}

/** Run several onAction hooks in order (stderr trace + structured emit). */
function composeOnAction(
  ...hooks: Array<(action: WorkflowAction, i: number) => void>
): (action: WorkflowAction, i: number) => void {
  return (action, i) => {
    for (const h of hooks) h(action, i);
  };
}
