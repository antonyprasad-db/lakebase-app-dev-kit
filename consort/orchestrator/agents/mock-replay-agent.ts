// mock-replay-agent: a role-agnostic REPLAY mock , a StepAgent (no cloud/model) that, instead
// of inventing content, copies a role's RECORDED authoring from a scenario corpus into the
// provided workspace. Its canonical use is the PO Human Mock (the recorded product-overview.md /
// nfrs.md / design-brief.md become the turn-1 outputs the spec-author then consumes), but the
// `role` option makes it faithfully re-materialize ANY role's recorded artifacts offline , the
// catalogue's `replay` kind (agent-catalogue.ts) is a thin wrapper over this.
//
// It is a StepAgent (same seam as ClaudeStepAgent + the test mock), so Step + the
// StepExecutor drive it identically , the Template Method does not know or care that this
// step is a deterministic replay rather than a live model turn. That is the point of the
// contract: a step is a step.

import { readFileSync, writeFileSync, existsSync, mkdirSync, cpSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative, sep } from "node:path";
import { codeTreeFilter } from "../../logging/replay-build.js";
import { ARTIFACT_ROOT, LEGACY_ARTIFACT_ROOTS } from "../../config/consort-paths.js";
import type { StepAgent, AgentInvocation } from "./agent-types.js";
import type { WorkflowAction } from "../workflow/workflow-vocabulary.js";

/** One recorded artifact to materialize into the workspace under `outputId`.
 *  kind "file" (default) copies a single recorded file corpus `from` -> workspace `to`.
 *  kind "tree" overlays a recorded CODE TREE (a recorded-build turn's code/ dir) into the
 *  workspace, filtered by codeTreeFilter (excludes scaffold-owned dirs + junk , the SAME filter
 *  replayBuildTurn uses), so a build-turn chain can seed a turn's pre-state working tree. */
export interface RecordedSeed {
  /** The manifest output id this seed satisfies (for diagnostics + mapping). */
  outputId: string;
  /** "file" (single file, default) or "tree" (a recorded code tree, codeTreeFilter-filtered). */
  kind?: "file" | "tree";
  /** Path (relative to the corpus root) of the recorded artifact (a file, or a tree dir). */
  from: string;
  /** Path (relative to the workspace) the artifact lands at (the filename, or "." for a tree). */
  to: string;
}

/** What the PO mock is told to replay: the corpus root + the recorded seed files, plus the
 *  role it stamps its authoring log under (so productOwnerLoggedAuthoring passes). */
export interface MockReplayAgentOptions {
  /** Absolute path to the scenario corpus root the recorded files live under. */
  corpusRoot: string;
  /** The recorded seeds to copy into the workspace. */
  seeds: RecordedSeed[];
  /** The role stamped on the authoring log event (default "product-owner"). */
  role?: string;
}

/**
 * Build a PO Human Mock replay agent. On invoke it copies each recorded seed from the corpus
 * into the provided workspace (fail loud if a recorded file is missing , a replay must never
 * silently produce nothing), then appends ONE authoring event to the workspace agent-log so
 * the manifest's log checker passes. Contained: it reads only the corpus + writes only the
 * workspace it was handed.
 */
export function makeMockReplayAgent(opts: MockReplayAgentOptions): StepAgent {
  const role = opts.role ?? "product-owner";
  return {
    async invoke(invocation: AgentInvocation): Promise<void> {
      const materialized: string[] = [];
      for (const seed of opts.seeds) {
        const src = join(opts.corpusRoot, seed.from);
        if (!existsSync(src)) {
          throw new Error(
            `ReplayPoMockAgent: recorded seed for "${seed.outputId}" not found at ${src} , a replay cannot fabricate it. Check the corpus root + recorded path.`,
          );
        }
        const dst = join(invocation.workspaceDir, seed.to);
        if (seed.kind === "tree") {
          // Overlay a recorded CODE TREE into the workspace, filtered by codeTreeFilter (the same
          // filter replayBuildTurn uses: excludes scaffold-owned dirs like .git/.sftdd/scripts +
          // junk like __pycache__). The dst is the overlay root (usually the workspace itself).
          mkdirSync(dst, { recursive: true });
          cpSync(src, dst, { recursive: true, force: true, filter: codeTreeFilter(src) });
        } else {
          // A single file. Seeds may land at a NESTED path (e.g. stories/<S>/acs/<AC>.json);
          // writeFileSync does not create intermediate dirs, so mkdir the parent first.
          mkdirSync(dirname(dst), { recursive: true });
          writeFileSync(dst, readFileSync(src, "utf8"));
        }
        materialized.push(seed.to);
      }
      // Log what the PO "authored" (the shared agent-log line the manifest's log checker
      // requires), appended so a re-run does not clobber a prior turn's log.
      const event = {
        timestamp: new Date().toISOString(),
        level: "info",
        role,
        event: "artifact.written",
        message: `replayed PO authoring: ${materialized.join(", ")}`,
      };
      const logPath = join(invocation.workspaceDir, "agent-log.jsonl");
      const prior = existsSync(logPath) ? readFileSync(logPath, "utf8") : "";
      writeFileSync(logPath, prior + JSON.stringify(event) + "\n");
    },
  };
}

// ─── Step-aware corpus replay ────────────────────────────────────────────────
//
// makeStepReplayAgent is the SEEDLESS, action-driven replay agent: instead of a
// hand-authored seed list, it consumes a WHOLE recorded corpus (a scenario's
// `turns/NNNN-<label>/` timeline, each with a `turn.json` carrying {action, produced[]}
// and a `files/` snapshot of exactly what that turn produced). On each invoke it finds
// the recorded turn that matches the invocation's action, materializes that turn's
// `files/` into the workspace (the design/build DELTA the recorded agent wrote), and
// appends the recorded authoring log line. This is what lets the SAME shipped manifest
// resolve to a corpus-replaying agent (kind "replay" with no seeds) so a whole run
// replays through the ordinary executor with no model spawn.
//
// AMBIGUITY: a corpus is NOT one-action-per-turn , the same action recurs (both sprints
// re-run product-owner/gate/breakdown; a design revise loop re-runs a story's spec-author;
// an assess retry loop re-runs the same assess action). So matching on the action alone is
// ambiguous. The orchestrator replays actions in the SAME order they were recorded, so the
// agent walks a per-corpus ORDINAL CURSOR: for a given action it returns the NEXT
// not-yet-consumed recorded turn whose action matches, in corpus order. The cursor is
// module-scoped keyed by corpusRoot because buildAgent reconstructs the agent every turn
// (the executor builds a fresh Step per action), so an instance field would reset each turn.

/** One recorded turn discovered under a corpus `turns/` dir. */
interface CorpusTurn {
  dir: string;
  action: WorkflowAction;
}

/** A monotonic cursor over a corpus's recorded turns, shared across the per-turn agent
 *  rebuilds for one corpusRoot. `consumed` counts how many turns of each action signature
 *  have already been replayed, so a recurring action resolves to the next recorded instance. */
interface CorpusCursor {
  turns: CorpusTurn[];
  consumed: Map<string, number>;
}

const CORPUS_CURSORS = new Map<string, CorpusCursor>();

/** A stable signature for an action , the discriminators a corpus turn is keyed on. */
function actionSignature(a: WorkflowAction): string {
  return JSON.stringify(a);
}

/** Load (once per corpusRoot) the ordered list of recorded turns from `turns/`. Sorted by the
 *  NNNN ordinal prefix so the cursor walks them in recorded order. */
function loadCursor(corpusRoot: string): CorpusCursor {
  const existing = CORPUS_CURSORS.get(corpusRoot);
  if (existing) return existing;
  const turnsDir = join(corpusRoot, "turns");
  if (!existsSync(turnsDir)) {
    throw new Error(
      `makeStepReplayAgent: no turns/ timeline under corpus root ${corpusRoot} , a step-aware replay needs the recorded turns/ dir (each turns/NNNN-<label>/turn.json + files/).`,
    );
  }
  const turns: CorpusTurn[] = [];
  for (const name of readdirSync(turnsDir).sort()) {
    const dir = join(turnsDir, name);
    const tj = join(dir, "turn.json");
    if (!existsSync(tj) || !statSync(dir).isDirectory()) continue;
    try {
      const parsed = JSON.parse(readFileSync(tj, "utf8")) as { action?: WorkflowAction };
      if (parsed.action) turns.push({ dir, action: parsed.action });
    } catch {
      /* a turn without a parseable action is not replayable by action-match; skip it */
    }
  }
  const cursor: CorpusCursor = { turns, consumed: new Map() };
  CORPUS_CURSORS.set(corpusRoot, cursor);
  return cursor;
}

/** Reset the corpus cursor for a root (call at the start of a fresh replay run so a re-run in
 *  the same process starts from turn 0 rather than continuing a prior run's cursor). */
export function resetStepReplayCursor(corpusRoot: string): void {
  CORPUS_CURSORS.delete(corpusRoot);
}

/** Rewrite a recorded corpus-relative path onto the LIVE artifact root: the corpus was recorded
 *  under a legacy `.sftdd`/`.tdd` root, but the live tree uses `.consort` (ARTIFACT_ROOT). A
 *  product-channel path (app/, tests/, client/, alembic/) has no artifact-root prefix and is
 *  returned unchanged. */
function remapArtifactRoot(rel: string): string {
  const parts = rel.split(sep);
  if (parts.length > 0 && (LEGACY_ARTIFACT_ROOTS as readonly string[]).includes(parts[0])) {
    parts[0] = ARTIFACT_ROOT;
    return parts.join(sep);
  }
  return rel;
}

/** Recursively copy a recorded turn's `files/` delta into the workspace, remapping the artifact
 *  root and creating intermediate dirs. Returns the workspace-relative paths materialized. */
function materializeFiles(filesDir: string, workspaceDir: string): string[] {
  const out: string[] = [];
  const walk = (abs: string): void => {
    for (const name of readdirSync(abs)) {
      const src = join(abs, name);
      if (statSync(src).isDirectory()) {
        walk(src);
        continue;
      }
      const rel = remapArtifactRoot(relative(filesDir, src));
      const dst = join(workspaceDir, rel);
      mkdirSync(dirname(dst), { recursive: true });
      writeFileSync(dst, readFileSync(src));
      out.push(rel);
    }
  };
  walk(filesDir);
  return out;
}

/** Build a STEP-AWARE corpus replay agent. On invoke it resolves the recorded turn matching the
 *  invocation's action (next not-yet-consumed instance in corpus order, so a recurring action
 *  resolves deterministically), materializes that turn's `files/` delta into the workspace, and
 *  appends the recorded authoring log line stamped with the action's role. A corpus MISS is a
 *  HARD failure (a replay must never silently fabricate a turn's output). */
export function makeStepReplayAgent(opts: { corpusRoot: string }): StepAgent {
  return {
    async invoke(invocation: AgentInvocation): Promise<void> {
      const cursor = loadCursor(opts.corpusRoot);
      const sig = actionSignature(invocation.action);
      const already = cursor.consumed.get(sig) ?? 0;
      // The Nth occurrence (0-indexed = already) of this action in corpus order.
      const matches = cursor.turns.filter((t) => actionSignature(t.action) === sig);
      const turn = matches[already];
      if (!turn) {
        throw new Error(
          `makeStepReplayAgent: no recorded turn for action ${sig} (occurrence #${already + 1}) under ${opts.corpusRoot}/turns , a replay cannot fabricate it. Recorded ${matches.length} occurrence(s) of this action.`,
        );
      }
      cursor.consumed.set(sig, already + 1);

      const filesDir = join(turn.dir, "files");
      const materialized = existsSync(filesDir) ? materializeFiles(filesDir, invocation.workspaceDir) : [];

      // Append the authoring log line so the manifest's log validator passes (the corpus files/
      // carry the artifacts but not the agent-log line, which is meta). Stamp the action's role.
      const role = invocation.action.kind === "invoke-role" ? invocation.action.role : "orchestrator";
      const event = {
        timestamp: new Date().toISOString(),
        level: "info",
        role,
        event: "artifact.written",
        message: `replayed ${role} turn ${turn.dir.split(sep).pop()}: ${materialized.join(", ") || "(no files delta)"}`,
      };
      const logPath = join(invocation.workspaceDir, "agent-log.jsonl");
      const prior = existsSync(logPath) ? readFileSync(logPath, "utf8") : "";
      writeFileSync(logPath, prior + JSON.stringify(event) + "\n");
    },
  };
}
