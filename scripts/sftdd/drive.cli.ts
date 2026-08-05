#!/usr/bin/env node
// lakebase-sftdd-drive: the deterministic orchestrator driver (phase 3b).
//
//   lakebase-sftdd-drive --feature <id> [--project-dir <dir>] [--tdd-dir <dir>]
//                      [--instance <i>] [--deploy-target <t>] [--approver <a>]
//                      [--dry-run]
//
// Reads the project's persisted state, asks nextTransition for the next action,
// and performs it, looping to `done`. This replaces the LLM scrum-master with a
// code state-machine: instant routing, deterministic per-action logging, and
// the per-story pipeline actually streams (one process holds both lanes). Roles
// are still invoked as LLM subagents (claude -p --agent <role>); only the
// routing is code.
//
// --dry-run computes + prints the SINGLE next action and the commands it would
// run, then exits (no execution) - a safe "what will the driver do next?".

import { sftddEnv } from "./sftdd-env.js";
import { resolveSftddDir, ARTIFACT_ROOT, LEGACY_ARTIFACT_ROOT } from "./sftdd-paths.js";
import { migrateLegacyArtifactDir } from "./migrate-artifact-dir.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";

import { recordTurn, seedRecorderBaseline } from "./turn-recorder.js";
import { recordBuildTurn, nextBuildTurnNumber } from "./record-build.js";
import { runDriver, driverBoundOptions, ProtocolViolationError, UnexpectedCallbackError, type DriveEffects, type DriverBound, type RunDriverResult, type RunDriverOptions } from "../../consort/orchestrator/drive/orchestrator-run.js";
import { writeEscalation } from "./escalation.js";
import { emitNextJson } from "./next.js";
import { emitAgentLogEvent } from "./agent-log.js";
import { resetStaleTerminalPhase } from "./workflow-phase.js";
import {
  isHitlGateAction,
  isHumanInputAction,
  pauseBeforeMilestone,
  type PauseMilestone,
  type WorkflowAction,
} from "../../consort/orchestrator/drive/orchestrator-drive.js";
import {
  buildDriveEffects,
  commandsForAction,
  planNextAction,
  type DriveEffectsConfig,
} from "../../consort/orchestrator/drive/orchestrator-effects.js";
import {
  runSprint,
  readSprintBacklog,
  backlogFeatureIds,
  syncBacklog,
  deriveSprintPlanningState,
  type SprintEffects,
  type DriveStepResult,
} from "./orchestrator-sprint.js";
import { resolveSftddSettings, applyProjectOverrides } from "../../consort/orchestrator/drive/sftdd-config.js";
import { describeAction, approveHint, makeOnAction } from "./orchestrator-logging.js";
import { kitVersion } from "./kit-bin.js";
import { isForeignFeatureClaim, readWorkflowState } from "@databricks-solutions/lakebase-scm-utils/lakebase";
import { isCliEntry } from "@databricks-solutions/lakebase-scm-utils/util";
import { driveAuthPreflight } from "../../consort/orchestrator/provisioning/credentials.js";
import { writeRunConfig } from "./run-config.js";
import { resolveLaunchKitRef, pinRunKitRef, kitRefDriftWarning } from "./kit-ref.js";
import {
  buildCfg,
  execRunner,
  takeLastAgentTranscript,
  spawnCmd,
  type ParsedArgs,
  type TurnTranscript,
  ClaudeTurnError,
  ReplayCorpusMissError,
  ArtifactOutOfRootError,
} from "../../consort/orchestrator/drive/drive-runner.js";


function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {};
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--feature": out.feature = argv[++i]; break;
      case "--sprint": out.sprint = argv[++i]; break;
      case "--project-dir": out.projectDir = argv[++i]; break;
      case "--tdd-dir": out.sftddDir = argv[++i]; break;
      case "--instance": out.instance = argv[++i]; break;
      case "--deploy-target": out.deployTarget = argv[++i]; break;
      case "--approver": out.approver = argv[++i]; break;
      case "--dry-run": out.dryRun = true; break;
      case "--max-steps": out.maxSteps = Number(argv[++i]); break;
      case "--plan-only": out.planOnly = true; break;
      case "--only": out.only = argv[++i]; break;
      case "--pause-before": out.pauseBefore = argv[++i]; break;
      case "--gates": out.gates = argv[++i]; break;
      // Sizing (the Architect's t-shirt-sizing / planning-poker step) is ON by
      // default. --no-sizing opts OUT: planning goes propose -> author-requests
      // with no estimate, for a backlog small enough not to need capacity sizing.
      case "--no-sizing":
      case "--no-planning-poker":
      case "--no-t-shirt-sizing": out.noSizing = true; break;
      case "--help": case "-h": out.help = true; break;
      default: break;
    }
  }
  return out;
}

function help(): string {
  return `lakebase-sftdd-drive (deterministic orchestrator driver)

Usage:
  lakebase-sftdd-drive --feature <id> [flags]

Flags:
  --feature <id>       Feature to drive (required)
  --project-dir <dir>  Project root (default: cwd)
  --tdd-dir <dir>      artifact root (default: <project-dir>/.sftdd, honors a legacy .tdd)
  --instance <id>      Lakebase instance id (threaded to experiment branch ops)
  --deploy-target <t>  Deploy target for the deploy phase (default: local)
  --approver <name>    Headless gate approver (default: human-proxy)
  --dry-run            Print the single next action + its commands, then exit
  --max-steps <n>      Stop after n actions (incremental/live testing + safety)
  --plan-only          Tier-2: run the sprint planning sub-machine only (/plan)
  --only <phase>       Tier-2 bound: design | build | deploy (one phase, then stop)
  --pause-before <m>   PAUSE (not stop) just before a handoff: navigator (the
                       build kickoff) | release-engineer (the deploy/verify). The
                       driver blocks for a human [Y/n], then RESUMES the same run
                       on Y , it never leaves the state machine. n re-asks. Set
                       LAKEBASE_SFTDD_AUTO_CONTINUE=1 to auto-confirm (non-interactive).
  --gates <mode>       interactive (default: stop AT each HITL gate so the human
                       answers, then re-run) | proxy (headless: Human Proxy
                       approves; requires LAKEBASE_SFTDD_AUTO_CONTINUE=1 or CI).
                       Run-scoped: overrides project.gates for THIS run only,
                       never rewrites sftdd-config.json.
  --no-sizing          Skip the Architect's t-shirt-sizing (planning-poker) step:
                       planning goes propose -> author-requests, no estimate.
                       Sizing is ON by default. Aliases: --no-planning-poker,
                       --no-t-shirt-sizing.
`;
}


/**
 * The PAUSE gate's human wait: block the state machine at the handoff and ask
 * [Y/n], then RESUME on Y (n re-asks; the run never bails). Three input sources,
 * in order:
 *   1. LAKEBASE_SFTDD_AUTO_CONTINUE=1   , auto-confirm (CI / fully non-interactive).
 *   2. LAKEBASE_SFTDD_GATE_ANSWER_FILE  , poll that file for y/n (a parent process
 *      drives the gate, e.g. a controller answering on the human's behalf).
 *   3. an interactive stdin TTY       , prompt + read the human's line.
 * With none of those (piped, no control file), it auto-continues with a warning
 * rather than crashing or hanging. It never opens /dev/tty (absent in many
 * sandboxes, and its open error is async , the prior cause of a hard crash).
 */
function makeConfirmContinue(): (action: WorkflowAction) => Promise<void> {
  const auto = sftddEnv("AUTO_CONTINUE") === "1";
  const answerFile = sftddEnv("GATE_ANSWER_FILE")?.trim();
  const isYes = (a: string): boolean => a === "" || a === "y" || a === "yes";
  return (action) =>
    new Promise<void>((resolve, reject) => {
      const label = describeAction(action);
      const prompt = `\n[drive] PAUSED , continue past the ${label} handoff? [Y/n] `;
      if (auto) {
        process.stderr.write(`[drive] PAUSE gate (auto-continue): proceeding past ${label}\n`);
        return resolve();
      }
      // (2) Control channel: poll the answer file (written y/n by a controller).
      if (answerFile) {
        process.stderr.write(`${prompt}\n[drive] (awaiting answer in ${answerFile})\n`);
        const poll = setInterval(() => {
          let raw: string;
          try { raw = fs.readFileSync(answerFile, "utf8"); } catch { return; } // not written yet
          const a = raw.trim().toLowerCase();
          if (a === "") return; // present but blank , keep waiting
          try { fs.rmSync(answerFile, { force: true }); } catch { /* ignore */ }
          if (a === "y" || a === "yes") { clearInterval(poll); process.stderr.write(`[drive] resuming.\n`); resolve(); }
          else process.stderr.write(`[drive] holding , write Y to ${answerFile} when ready.\n`);
        }, 1000);
        return;
      }
      // (3) Interactive terminal.
      if (process.stdin.isTTY) {
        const ask = (): void => {
          const rl = readline.createInterface({ input: process.stdin, output: process.stderr, terminal: false });
          rl.question(prompt, (answer) => {
            rl.close();
            if (isYes(answer.trim().toLowerCase())) { process.stderr.write(`[drive] resuming.\n`); resolve(); }
            else { process.stderr.write(`[drive] holding , answer Y when ready.\n`); ask(); }
          });
        };
        return ask();
      }
      // No auto-confirm, no control channel, no TTY: there is NO human in the
      // loop, so STOP rather than silently proceed past the handoff (an
      // agent-driven non-TTY run must not self-approve). A deliberate headless
      // run sets LAKEBASE_SFTDD_AUTO_CONTINUE=1; a controller writes a gate-answer
      // file; a human uses a terminal. None present = refuse.
      reject(
        new Error(
          `[drive] PAUSED at the ${label} handoff with no human channel , refusing to continue. ` +
            `Set LAKEBASE_SFTDD_AUTO_CONTINUE=1 (deliberate headless), provide ` +
            `LAKEBASE_SFTDD_GATE_ANSWER_FILE, or run in an interactive terminal.`,
        ),
      );
    });
}

/**
 * Wrap effects so that, when LAKEBASE_SFTDD_RECORD_BUILD_DIR is set, the driver
 * snapshots each Navigator/Driver turn AFTER its effect lands , the per-turn
 * build corpus the event-by-event replay plays back. A no-op when unset, so a
 * normal run is unaffected. Only build turns (invoke-role navigator|driver) are
 * recorded; design/deploy turns are not build output.
 */
function withBuildRecording(inner: DriveEffects, cfg: DriveEffectsConfig): DriveEffects {
  const recordBuildDir = sftddEnv("RECORD_BUILD_DIR")?.trim();
  if (!recordBuildDir) return inner;
  return {
    readState: () => inner.readState(),
    onAction: inner.onAction ? (a, i) => inner.onAction!(a, i) : undefined,
    async perform(action) {
      await inner.perform(action);
      if (action.kind === "invoke-role" && (action.role === "navigator" || action.role === "driver")) {
        // Seed the ordinal PER-STORY from disk (not a per-process counter): a
        // resumed drive continues the story's sequence instead of restarting at 1
        // and writing a stray 001-… dir that sorts before the earlier turns and
        // corrupts replay order.
        const turn = nextBuildTurnNumber(recordBuildDir, cfg.featureId, action.story);
        const dir = recordBuildTurn({
          recordBuildDir,
          projectDir: cfg.projectDir,
          sftddDir: cfg.sftddDir,
          featureId: cfg.featureId,
          story: action.story,
          turn,
          role: action.role,
          ac: "ac" in action ? action.ac : undefined,
          mode: action.buildMode,
        });
        process.stderr.write(
          `[record] turn ${turn}: ${action.role}${action.buildMode ? ` (${action.buildMode})` : ""}` +
            `${"ac" in action && action.ac ? ` ${action.ac}` : ""} -> ${dir}\n`,
        );
      }
    },
  };
}

/**
 * Wrap effects so that, when LAKEBASE_SFTDD_RECORD_DIR is set, the driver records
 * EVERY state-machine turn AFTER its effect lands , the universal per-turn
 * timeline (design, gates, build, deploy, accept, promote), not just the build
 * lane. Each turn writes turns/<NNNN>-<label>/ (manifest + the .tdd/code delta it
 * produced) + refreshes the cumulative recorded-artifacts mirror that
 * replayDesignTurn consumes. Composes with withBuildRecording (which populates
 * recorded-build for replayBuildTurn), so one recordDir holds the whole
 * record/replay corpus. A no-op when unset, so a normal run is unaffected.
 */
function withTurnRecording(inner: DriveEffects, cfg: DriveEffectsConfig): DriveEffects {
  const recordDir = sftddEnv("RECORD_DIR")?.trim();
  if (!recordDir) return inner;
  // Seed the delta baseline with the current (post-scaffold/intake) state ONCE,
  // so the first recorded turn reports only what it produced, not the pre-existing
  // scaffold. A no-op once a baseline exists (later drive processes in the run).
  seedRecorderBaseline({ recordDir, projectDir: cfg.projectDir, sftddDir: cfg.sftddDir });
  return {
    readState: () => inner.readState(),
    onAction: inner.onAction ? (a, i) => inner.onAction!(a, i) : undefined,
    onHandback: inner.onHandback ? (h, d) => inner.onHandback!(h, d) : undefined,
    async perform(action) {
      await inner.perform(action);
      if (action.kind === "done") return; // terminal no-op, produces nothing
      // An invoke-role action just ran an agent; grab its outcome-level
      // transcript (prompt + final reasoning + tool list) to record alongside
      // the artifact delta. Non-agent actions (gates, deploy) have none.
      const transcript = takeLastAgentTranscript();
      const rec = recordTurn({ recordDir, projectDir: cfg.projectDir, sftddDir: cfg.sftddDir, action, step: 0, transcript });
      process.stderr.write(
        `[record] turn ${rec.ordinal} (${rec.dir}): ${rec.produced.length} produced` +
          `${rec.deleted.length ? `, ${rec.deleted.length} deleted` : ""}\n`,
      );
    },
  };
}

/** Compose a phase bound's stopWhen with the interactive gate stop: in
 *  interactive mode the driver also halts at each HITL gate for the human. */
function gatedStopWhen(
  base: RunDriverOptions["stopWhen"],
  interactive: boolean,
): RunDriverOptions["stopWhen"] {
  if (!interactive) return base;
  // Interactive: also stop where the HUMAN provides an input artifact (the PO's
  // feature-requests at author-requests), so the human supplies them and re-runs
  // , the same transition the Human Proxy performs headless.
  return (a) => (base?.(a) ?? false) || isHitlGateAction(a) || isHumanInputAction(a);
}

/** The HITL gate a bounded run halted at (interactive mode), or undefined. */
function pendingGateOf(r: RunDriverResult): WorkflowAction | undefined {
  return r.stoppedAtBound && r.stoppedAt && isHitlGateAction(r.stoppedAt) ? r.stoppedAt : undefined;
}

/** The HUMAN-INPUT stop a bounded run halted at (interactive mode) , the PO's
 *  `author-requests`, or undefined. gatedStopWhen halts here so the human supplies
 *  the feature-request(s); it is NOT an approval gate, so pendingGateOf misses it.
 *  Surfacing it separately is why interactive `--plan-only` no longer misreports a
 *  PO pause (nothing produced) as "plan gate approved" (Finding 5). */
function pendingInputOf(r: RunDriverResult): WorkflowAction | undefined {
  return r.stoppedAtBound && r.stoppedAt && isHumanInputAction(r.stoppedAt) ? r.stoppedAt : undefined;
}

/** Map a driver result to the sprint's DriveStepResult. Carries BOTH halt kinds:
 *  a clean interactive pause (pendingGate) AND a raise-to-HIL (escalated), so the
 *  sprint orchestrator stops on either instead of counting an escalated feature
 *  "complete" and advancing (which then trips the next claim's already-claimed
 *  guard). Mirrors the single-feature drive's escalated/pendingGate handling. */
function stepResultOf(r: RunDriverResult): DriveStepResult {
  return { pendingGate: pendingGateOf(r), pendingInput: pendingInputOf(r), escalated: r.escalated, escalation: r.escalation };
}

function reportGate(gate: WorkflowAction, ctx: { featureId?: string; sprint?: string; featureBranch?: string } = {}): void {
  // Reuse the shared action narration (DRY) instead of dumping raw JSON; the
  // full action is available under LAKEBASE_SFTDD_TRACE for debugging.
  const trace = sftddEnv("TRACE") ? `  ${JSON.stringify(gate)}` : "";
  process.stderr.write(
    `[drive] GATE awaiting human approval: ${describeAction(gate)}.${trace}\n` +
      `        Record your decision with:\n` +
      `          ${approveHint(gate, ctx)}\n` +
      `        then re-run to continue.\n`,
  );
}

/** Report an interactive pause awaiting HUMAN INPUT (the PO's feature-request(s)
 *  at author-requests). Unlike a gate (work done, awaiting approval), NOTHING has
 *  been produced , so this must never read as "approved/complete". */
function reportInput(action: WorkflowAction, sprint?: string): void {
  const s = sprint ?? "<sprint>";
  process.stderr.write(
    `[drive] PAUSED , awaiting human input (${describeAction(action)}). Nothing was approved or produced yet.\n` +
      `        The Product Owner must:\n` +
      `          1. author the sprint's feature-request(s) at .sftdd/features/<id>/feature-request.md, then\n` +
      `          2. commit the backlog: lakebase-sftdd-sync-backlog --sprint ${s} --features <id[,id...]>\n` +
      `        then re-run the drive , it will advance to the (interactive) plan gate.\n`,
  );
}

/**
 * Tier-1 sprint mode (`--sprint <name>`, no `--feature`): the `/sprint`
 * orchestrator. Drives sprint planning to the plan gate, then claims + drives
 * each backlog feature. `--plan-only` runs planning only (the `/plan` command).
 * `--gates interactive` halts at each HITL gate for the human + re-runs to resume.
 */
async function runSprintMode(args: ParsedArgs): Promise<number> {
  const sprint = args.sprint as string;
  const projectDir = args.projectDir ?? process.cwd();
  const sftddDir = args.sftddDir ?? resolveSftddDir(projectDir);
  // Claim through the project's lk shim, exactly as per-feature mode and
  // capture-scenario.sh do. scm-claim-feature is a SUBSTRATE bin
  // (lakebase-scm-claim-feature-branch); post-extraction it lives in
  // node_modules/@databricks-solutions/lakebase-scm-utils, NOT the kit dist, so a
  // hardcoded kit-relative path no longer resolves. The lk shim routes the bin
  // through node_modules + the run's pinned kit ref.
  const lkShim = path.join(projectDir, "scripts", "lk");
  // sizing comes from sftdd-config.json; the gate mode is RUN-SCOPED (--gates
  // override else the project's declared policy), never read back from a
  // flag-mutated file.
  const settings = resolveSftddSettings({ projectDir });
  const gates = effectiveGates(args, projectDir);
  const interactive = gates === "interactive";
  const skipSizing = !settings.plan.sizing;

  const effects: SprintEffects = {
    async drivePlanning() {
      const cfg = buildCfg(args, "");
      cfg.runner = execRunner(cfg);
      snapshotRunConfig(cfg, "plan", gates);
      const planning: DriveEffects = {
        // Sizing is ON by default; --no-sizing (or config plan.sizing:false) opts out.
        readState: async () => deriveSprintPlanningState(sftddDir, sprint, { skipSizing }),
        async perform(action) {
          for (const cmd of commandsForAction(action, cfg)) await cfg.runner.run(cmd);
        },
        onAction: cfg.onAction,
      };
      const base = driverBoundOptions("plan");
      const r = await runDriver(withTurnRecording(planning, cfg), {
        ...base,
        stopWhen: gatedStopWhen(base.stopWhen, interactive),
      });
      return stepResultOf(r);
    },
    async readBacklog() {
      return backlogFeatureIds(readSprintBacklog(sftddDir, sprint));
    },
    async commitAndPushRequests() {
      // Commit the feature-requests planning authored + push the entry tier so
      // each feature branch (which forks from origin/<parent>) inherits them. The
      // add + commit are tolerant (a no-op when nothing changed, e.g. the requests
      // were pre-seeded + already committed); a PUSH failure is loud, since a
      // silent one resurfaces later as a cryptic Spec Author refusal on the fork.
      const root = path.basename(sftddDir);
      for (const id of backlogFeatureIds(readSprintBacklog(sftddDir, sprint))) {
        await spawnCmd("git", ["add", "--", `${root}/features/${id}/feature-request.md`], projectDir).catch(() => undefined);
      }
      await spawnCmd("git", ["commit", "-m", `plan: ${sprint} feature-requests`], projectDir).catch(() => undefined);
      await spawnCmd("git", ["push", "origin", "HEAD"], projectDir);
    },
    async isFeatureShipped(featureId) {
      // Skip a backlog feature that is already shipped so the sprint does not
      // re-claim + re-drive it (FEIP-8022). "Shipped" = the feature's OWN
      // workflow (now feature-scoped, so no cross-feature phase leak) derives to
      // `done`: every story built + accepted, deployed, and promoted/merged. This
      // reliably skips a feature the sprint itself drove to done (resume) or one
      // shipped in-band via the drive. A feature shipped fully out-of-band (its
      // promotion merged outside the drive, so its recorded state never reached
      // done) is NOT detected here , that divergence is the reconcile capability's
      // job (FEIP-8018). Best-effort: any read/derive error => not shipped (drive it).
      try {
        const { action } = await planNextAction(buildCfg(args, featureId));
        return action.kind === "done";
      } catch {
        return false;
      }
    },
    async claimFeature(featureId) {
      await spawnCmd(lkShim, ["lakebase-scm-claim-feature-branch", featureId, "--project-dir", projectDir, "--json"], projectDir);
    },
    async driveFeature(featureId) {
      const cfg = buildCfg(args, featureId);
      // A fresh feature in the sprint loop (feature 2+, or the first feature of a
      // later sprint on the same project) must NOT inherit the PRIOR feature's
      // terminal TDD phase: the per-project workflow-state.json carries
      // "shipped"/"done" from the last feature, and neither the SCM claim nor
      // anything else clears it, so the next feature's drive reads phase === done
      // and exits at turn 000 without building. Same guard the single-feature
      // drive applies (see runFeatureMode); only a terminal phase is cleared, so a
      // resumed mid-flight feature is untouched.
      resetStaleTerminalPhase(cfg.sftddDir);
      cfg.runner = execRunner(cfg);
      snapshotRunConfig(cfg, "full", gates);
      const r = await runDriver(withTurnRecording(withBuildRecording(buildDriveEffects(cfg), cfg), cfg), {
        stopWhen: gatedStopWhen(undefined, interactive),
      });
      return stepResultOf(r);
    },
    onFeature: (f, i) => process.stderr.write(`[sprint] feature ${i + 1}: ${f}\n`),
    onSkip: (f, i) => process.stderr.write(`[sprint] feature ${i + 1}: ${f} , already shipped, skipping\n`),
  };

  // /plan: planning only (do not enter the per-feature loop).
  if (args.planOnly) {
    try {
      const planning = await effects.drivePlanning();
      // A HITL gate pause = work produced, awaiting approval (resumable, exit 0).
      if (planning.pendingGate) {
        reportGate(planning.pendingGate, { sprint });
        return 0;
      }
      // A human-input pause = the PO must author requests FIRST; nothing was
      // produced and the plan gate was NOT reached. Report it honestly and exit
      // non-zero (the postcondition , an approved plan , is not met), so a caller
      // never advances on an empty backlog thinking the plan was approved.
      if (planning.pendingInput) {
        reportInput(planning.pendingInput, sprint);
        return 2;
      }
      process.stderr.write(`[plan] ${sprint} planning complete (plan gate approved)\n`);
      return 0;
    } catch (err) {
      process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
      return 1;
    }
  }

  try {
    const result = await runSprint(effects);
    if (result.escalated) {
      // A step RAISED TO HIL: the sprint is NOT complete. Surface + halt (exit
      // non-zero) exactly like the single-feature drive, so the capture harness
      // stops instead of advancing to the next sprint (whose claim would trip
      // `already-claimed-other` on the still-open feature). Resumable after the
      // human resolves the escalation recorded under <sftddDir>/escalations/.
      const e = result.escalation;
      const on = result.pendingFeature ? ` on ${result.pendingFeature}` : "";
      process.stderr.write(
        `[sprint] RAISED TO HIL${on} , halting sprint ${sprint}.\n` +
          (e?.source ? `        source: ${e.source}\n` : "") +
          (e?.reason ? `        reason: ${e.reason}\n` : "") +
          `        recorded under ${path.basename(sftddDir)}/escalations/ ; resolve it, then re-run to resume.\n`,
      );
      return 3;
    }
    if (result.pendingGate) {
      if (result.pendingFeature) process.stderr.write(`[sprint] paused on ${result.pendingFeature}\n`);
      reportGate(result.pendingGate, { sprint, featureId: result.pendingFeature });
      return 0;
    }
    if (result.pendingInput) {
      // Planning paused for the PO to author feature-request(s): the sprint did
      // NOT run (empty backlog). Report + exit non-zero so nothing treats it as a
      // completed sprint.
      if (result.pendingFeature) process.stderr.write(`[sprint] paused on ${result.pendingFeature}\n`);
      reportInput(result.pendingInput, sprint);
      return 2;
    }
    process.stderr.write(`[sprint] ${sprint} complete: ${result.features.length} feature(s)\n`);
    return 0;
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  }
}

/** The RUN-SCOPED gate mode: a `--gates` flag overrides for THIS run only; absent,
 *  the project's declared policy in sftdd-config.json wins. The flag never rewrites
 *  the file (that let one headless run flip an interactive project to proxy), so the
 *  effective mode is resolved fresh here, not read back from a mutated file. */
function effectiveGates(args: ParsedArgs, projectDir: string): "interactive" | "proxy" {
  const flag = args.gates as "interactive" | "proxy" | undefined;
  return flag ?? resolveSftddSettings({ projectDir }).project.gates;
}

/** True when the run has an explicit non-interactive signal (CI / auto-continue).
 *  Headless proxy gating is only legitimate with one of these; otherwise a stray
 *  LAKEBASE_SFTDD_HUMAN_PROXY leaking into a dev shell would silently bypass HITL. */
function hasNonInteractiveSignal(): boolean {
  return sftddEnv("AUTO_CONTINUE") === "1" || /^(1|true)$/i.test(process.env.CI ?? "");
}

/** P0.1: snapshot the resolved model + option matrix to .tdd/run-config.json (and
 *  the corpus root when recording) at the start of an ACTUAL run (not --dry-run),
 *  so a timing report is self-describing and two runs are A/B-comparable.
 *  Best-effort: writeRunConfig swallows its own IO errors. */
function snapshotRunConfig(cfg: DriveEffectsConfig, bound: string, gates: "interactive" | "proxy"): void {
  writeRunConfig({
    projectDir: cfg.projectDir,
    sftddDir: cfg.sftddDir,
    bound,
    // Run-scoped effective gate mode (--gates override else project policy),
    // recorded here so the snapshot is where the run-scoped choice lives , the
    // flag never persists into sftdd-config.json.
    gates,
    uiTrack: cfg.uiTrack,
    buildSessionScope: cfg.buildSessionScope,
    reviewEffort: cfg.reviewEffort,
    deployTarget: cfg.deployTarget,
    // loop + batchCap from the resolved settings (single source), so the snapshot
    // records what the drive actually used, never a stale env value.
    loopGranularity: cfg.loopGranularity,
    batchCap: cfg.batchCap,
    modelForRole: cfg.modelForRole ?? (() => "inherit"),
  });
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(help());
    return 0;
  }
  // Auto-migrate a legacy ".tdd" artifact dir to ".sftdd" before any mode runs,
  // so existing projects move to the current name on their next orchestrated run
  // (no-op once ".sftdd" exists). History follows via git mv when possible.
  if (!args.sftddDir) {
    const projectDir = args.projectDir ?? process.cwd();
    const m = migrateLegacyArtifactDir(projectDir);
    if (m.migrated) {
      process.stderr.write(
        `lakebase-sftdd-drive: migrated legacy ${LEGACY_ARTIFACT_ROOT}/ to ${ARTIFACT_ROOT}/ (via ${m.via}).\n`,
      );
    }
  }
  // Write-through the drive's ad-hoc override flags into sftdd-config.json BEFORE
  // any settings resolution, so the file stays the single source of truth (the
  // flag is a WRITER, not a parallel reader; absent flags never mutate the file).
  // NB: --gates is NOT here , it is run-scoped policy, resolved per run and never
  // persisted (see effectiveGates / applyProjectOverrides).
  applyProjectOverrides(args.projectDir ?? process.cwd(), {
    deployTarget: args.deployTarget,
    sizing: args.noSizing === true ? false : undefined,
  });

  // Pin the kit ref for the WHOLE run to a checkout-proof, gitignored file
  // (.lakebase/kit-ref.local) BEFORE any feature/sprint drive performs a branch
  // checkout (Finding 28). The committed .lakebase/kit-ref is git-tracked, so a
  // claim checkout / experiment re-fork (both fork from origin/<parent>) restores
  // a branch-committed ref out from under the run, silently running the WRONG kit.
  // The gitignored .local survives checkouts and the lk shim reads it with
  // precedence, so the orchestrator + subagents + manual lk calls all keep the
  // launch ref. Warn loudly when the committed ref drifts from the pinned ref.
  // Skipped under LAKEBASE_KIT_DIR (dir override) or when no ref is pinned.
  {
    const pd = args.projectDir ?? process.cwd();
    const launchRef = resolveLaunchKitRef(pd, process.env);
    if (launchRef) {
      const drift = kitRefDriftWarning(pd, launchRef);
      if (drift) process.stderr.write(`lakebase-sftdd-drive: ${drift}\n`);
      const r = pinRunKitRef(pd, launchRef);
      if (r.pinned) {
        process.stderr.write(
          `lakebase-sftdd-drive: pinned kit-ref '${launchRef}' to .lakebase/kit-ref.local for this run` +
            (r.previous ? ` (was '${r.previous}')` : "") +
            `.\n`,
        );
      }
    }
  }

  // HITL enforcement: headless proxy gating is only legitimate with an explicit
  // non-interactive signal. Refuse `proxy` in an interactive/dev context so a
  // stray LAKEBASE_SFTDD_HUMAN_PROXY (which the /plan|/sprint|... commands turn
  // into `--gates proxy`) can't silently bypass the human. CI + the smokes set
  // LAKEBASE_SFTDD_AUTO_CONTINUE=1 (or CI), so they pass.
  if (effectiveGates(args, args.projectDir ?? process.cwd()) === "proxy" && !hasNonInteractiveSignal()) {
    process.stderr.write(
      `lakebase-sftdd-drive: gate mode 'proxy' (Human Proxy approves headlessly) requires an explicit\n` +
        `non-interactive signal (LAKEBASE_SFTDD_AUTO_CONTINUE=1 or CI). Refusing to bypass HITL in an\n` +
        `interactive/dev context. Unset LAKEBASE_SFTDD_HUMAN_PROXY, or pass --gates interactive.\n`,
    );
    return 2;
  }

  // Fail-fast auth preflight (before ANY mode dispatch / agent spawn). A LIVE
  // drive spawns expensive LLM turns + DB-backed verifies; if the Databricks
  // OAuth refresh token is expired, credential minting fails deep inside a
  // test's DB connection and degrades into a hang, spinning the drive for hours.
  // Exercise the refresh token up front (scm-utils checkDatabricksAuth ->
  // `databricks auth token --force-refresh`) and halt immediately with the
  // reauth remediation. SKIP in replay/build-replay lanes (no live workspace):
  // those reproduce a recorded corpus and never mint a real credential.
  const inReplayLane = !!(sftddEnv("REPLAY_DIR") || sftddEnv("REPLAY_BUILD_DIR"));
  if (!inReplayLane && sftddEnv("SKIP_AUTH_PREFLIGHT") !== "1") {
    // No --databricks-host flag on the drive; checkDatabricksAuth exercises the
    // active profile's session (DATABRICKS_CONFIG_PROFILE / default), which is
    // exactly the session the agents + DB mint will use.
    const auth = await driveAuthPreflight();
    if (!auth.ok) {
      process.stderr.write(
        `lakebase-sftdd-drive: Databricks auth preflight FAILED , halting before any agent spawn.\n${auth.message}\n`,
      );
      return 2;
    }
  }

  // Tier-1: `--sprint <name>` with no `--feature` runs the whole-sprint orchestrator.
  if (args.sprint && !args.feature) {
    return runSprintMode(args);
  }
  if (!args.feature) {
    process.stderr.write(`lakebase-sftdd-drive: --feature is required.\n\n${help()}`);
    return 2;
  }

  // Resolve the Tier-2 phase bound (at most one). --plan-only is the sprint
  // planning bound; --only <phase> bounds a feature run to one phase.
  let bound: DriverBound | undefined;
  if (args.planOnly) bound = "plan";
  if (args.only) {
    if (!["design", "build", "deploy"].includes(args.only)) {
      process.stderr.write(`lakebase-sftdd-drive: --only must be design|build|deploy (got "${args.only}").\n`);
      return 2;
    }
    bound = args.only as DriverBound;
  }
  const boundOpts = bound ? driverBoundOptions(bound) : {};

  // --pause-before: a HITL gate (NOT a stop) just before a handoff (the Navigator
  // build kickoff, or the Release Engineer deploy). The driver blocks for a human
  // [Y/n] then RESUMES the same run. Backs run-to-navigator / run-to-release.
  let pauseMilestone: PauseMilestone | undefined;
  if (args.pauseBefore) {
    if (!["navigator", "release-engineer"].includes(args.pauseBefore)) {
      process.stderr.write(
        `lakebase-sftdd-drive: --pause-before must be navigator|release-engineer (got "${args.pauseBefore}").\n`,
      );
      return 2;
    }
    pauseMilestone = args.pauseBefore as PauseMilestone;
  }
  const pauseBefore = pauseMilestone ? pauseBeforeMilestone(pauseMilestone) : undefined;
  const confirmContinue = pauseMilestone ? makeConfirmContinue() : undefined;

  const cfg = buildCfg(args, args.feature);

  // FEIP-8023: refuse to drive a feature whose recorded SCM claim names a
  // DIFFERENT feature. With a prior feature shipped out-of-band and
  // .lakebase/workflow-state.json never reconciled, buildCfg would adopt the
  // stale predecessor's branch as this feature's featureBranch, so the experiment
  // would fork from (and the build commit onto) the wrong branch. Block loud , the
  // human claims this feature (or reconciles the prior one) first.
  {
    const scm = readWorkflowState(cfg.projectDir);
    if (isForeignFeatureClaim(scm, cfg.featureId)) {
      process.stderr.write(
        `lakebase-sftdd-drive: refusing to drive "${cfg.featureId}" , the SCM workflow state records a\n` +
          `DIFFERENT feature "${scm?.feature_id}" (branch ${scm?.branch ?? "?"}). Driving now would fork the\n` +
          `experiment from the wrong branch and commit build output onto it. Claim this feature first\n` +
          `(lakebase-scm-claim-feature-branch ${cfg.featureId}), or reconcile the prior out-of-band feature,\n` +
          `then re-run.\n`,
      );
      return 2;
    }
  }

  // A fresh --feature invocation must not inherit a PRIOR feature's terminal
  // TDD phase (the per-project .tdd/workflow-state.json carries "shipped"/"done"
  // from the last feature). Clear it so the feature being driven now re-derives
  // its phase from disk artifacts instead of exiting "done in 1".
  resetStaleTerminalPhase(cfg.sftddDir);

  if (args.dryRun) {
    const plan = await planNextAction(cfg, boundOpts.transition);
    process.stdout.write(JSON.stringify(plan, null, 2) + "\n");
    return 0;
  }

  cfg.runner = execRunner(cfg);
  const gates = effectiveGates(args, cfg.projectDir);
  snapshotRunConfig(cfg, bound ?? "full", gates);
  const interactive = gates === "interactive";
  try {
    const result = await runDriver(withTurnRecording(withBuildRecording(buildDriveEffects(cfg), cfg), cfg), {
      maxSteps: args.maxSteps,
      transition: boundOpts.transition,
      stopWhen: gatedStopWhen(boundOpts.stopWhen, interactive),
      pauseBefore,
      confirmContinue,
    });
    const pendingGate = pendingGateOf(result);
    const pendingInput = pendingInputOf(result);
    if (result.escalated) {
      // Surface + halt: a blocking problem was raised to the HIL. The escalation
      // is recorded under ${path.basename(cfg.sftddDir)}/escalations/; exit non-zero so the run fails loud
      // (the increment is genuinely not done) and a human resolves it.
      const e = result.escalation;
      process.stderr.write(
        `[drive] RAISED TO HIL after ${result.iterations} actions , awaiting HIL decision.\n` +
          `        source: ${e?.source}\n        reason: ${e?.reason}\n` +
          `        recorded under ${path.basename(cfg.sftddDir)}/escalations/ ; resolve it, then re-run to resume.\n`,
      );
      return 3;
    } else if (result.stoppedAtMax) {
      process.stderr.write(`[drive] stopped at --max-steps ${args.maxSteps} (${result.iterations} actions)\n`);
    } else if (pendingGate) {
      reportGate(pendingGate, { featureId: cfg.featureId, featureBranch: cfg.featureBranch });
    } else if (pendingInput) {
      // A human-input pause (the PO's author-requests) is NOT a completed bound:
      // nothing was produced. Report honestly + exit non-zero (never "complete").
      reportInput(pendingInput);
      return 2;
    } else if (result.stoppedAtBound) {
      const label = bound ?? "phase";
      // 0 actions on a bounded run means the phase was ALREADY satisfied (e.g.
      // `--only deploy` after every story already deployed + accepted per the
      // per-story pipeline), NOT a no-op failure. Say so plainly (FEIP-8016).
      process.stderr.write(
        result.iterations === 0
          ? `[drive] ${label} already complete (0 actions, nothing to do; the per-story pipeline already carried it out)\n`
          : `[drive] ${label} complete in ${result.iterations} actions (bounded)\n`,
      );
    } else {
      process.stderr.write(`[drive] done in ${result.iterations} actions\n`);
    }
    return 0;
  } catch (err) {
    // A handoff EXPECTATION violation: a role returned nothing/null for the
    // artifact it owed (or the workflow tried to advance past an unmet handoff).
    // Record an escalation + emit escalation.raised (honor "escalate on any
    // error"), then abort non-zero so the run fails loud , a human resolves it.
    if (err instanceof ProtocolViolationError) {
      const h = err.handoff;
      try {
        writeEscalation(cfg.sftddDir, {
          source: `protocol:${h.responder}`,
          reason: err.message,
          feature_id: cfg.featureId,
          ...(h.story ? { story_id: h.story } : {}),
        });
        emitAgentLogEvent(
          {
            role: "orchestrator",
            level: "error",
            event: "escalation.raised",
            feature_id: cfg.featureId,
            slots: { source: `protocol:${h.responder}`, reason: err.message, ...(h.story ? { story: h.story } : {}) },
          },
          { sftddDir: cfg.sftddDir },
        );
      } catch {
        /* logging/escalation is best-effort; the abort below is the real signal */
      }
      process.stderr.write(`[drive] ${err.message}\n        recorded under ${path.basename(cfg.sftddDir)}/escalations/ ; fix the responder, then re-run.\n`);
      return 3;
    }
    // A wrong / unexpected caller (concurrent dispatch): a callback arrived from a
    // role we are not awaiting. Record + abort, same as a contract violation.
    if (err instanceof UnexpectedCallbackError) {
      try {
        writeEscalation(cfg.sftddDir, {
          source: `protocol:unexpected-caller:${err.from}`,
          reason: err.message,
          feature_id: cfg.featureId,
          ...(err.scope.story ? { story_id: err.scope.story } : {}),
        });
        emitAgentLogEvent(
          {
            role: "orchestrator",
            level: "error",
            event: "escalation.raised",
            feature_id: cfg.featureId,
            slots: { source: `protocol:unexpected-caller:${err.from}`, reason: err.message, ...(err.scope.story ? { story: err.scope.story } : {}) },
          },
          { sftddDir: cfg.sftddDir },
        );
      } catch {
        /* best-effort */
      }
      process.stderr.write(`[drive] ${err.message}\n        recorded under ${path.basename(cfg.sftddDir)}/escalations/ ; resolve it, then re-run.\n`);
      return 3;
    }
    // A replay corpus miss: the recording is incomplete for a turn the pipeline
    // dispatched. Not an escalation (no live workflow to resume) , it is a corpus/
    // config defect. Fail loud with the missing-artifact guidance; no agent ran.
    if (err instanceof ReplayCorpusMissError) {
      process.stderr.write(`${err.message}\n`);
      return 2;
    }
    // A role produced no artifact under the project root (out-of-root write): a
    // producing-role defect, not a resumable workflow escalation. Fail loud with
    // the attributed guidance so the crash names the real culprit, not a cryptic
    // downstream consumer.
    if (err instanceof ArtifactOutOfRootError) {
      process.stderr.write(`[drive] ${err.message}\n`);
      return 3;
    }
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  } finally {
    // Auto-emit the authoritative "what next" snapshot to .sftdd/next.json on
    // EVERY stop (a gate, an escalation, feature-complete, an error, a killed
    // run), so an orchestrating agent's contract is "on any stop, read next.json
    // and present its options" instead of reverse-engineering the next move and
    // drifting into freeform (FEIP-8017). Feature scope only (the stops that need
    // it); `lakebase-sftdd-next --sprint` answers sprint scope on demand. Skipped
    // under replay/record so the recorded corpora stay clean; best-effort inside.
    const recordingOrReplaying =
      !!sftddEnv("REPLAY_DIR") || !!sftddEnv("REPLAY_BUILD_DIR") || !!sftddEnv("RECORD_BUILD_DIR") || !!sftddEnv("RECORD_DIR");
    if (cfg.featureId && !recordingOrReplaying) {
      emitNextJson(cfg.sftddDir, cfg.featureId, cfg.projectDir, {
        uiTrack: cfg.uiTrack,
        version: kitVersion(),
        ...(cfg.featureBranch ? { featureBranch: cfg.featureBranch } : {}),
      });
    }
  }
}

// Guard the CLI entry so this module can be imported (by tests + the optimize
// harness, which reuse buildCfg/execRunner/claudeToolArgs) without spawning a
// drive. Only `node drive.cli.js` (the bin) actually runs main().
if (isCliEntry(import.meta.url)) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
      process.exit(1);
    },
  );
}
