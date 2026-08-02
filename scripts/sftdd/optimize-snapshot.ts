// optimize-snapshot: capture + restore the pre-turn state at a handoff boundary,
// so every candidate for that handoff runs from an IDENTICAL starting point (the
// champion walk's core invariant). Two turn kinds:
//
//   DESIGN turns write only .sftdd artifacts (pure): snapshot copies the .sftdd
//   tree aside; restore replaces the live tree with the copy wholesale (so a
//   candidate that ADDED files is fully undone). No git, no cloud.
//
//   BUILD turns mutate three things , the git experiment-branch commit, the
//   paired Lakebase child branch, and that branch's DB rows. Snapshot records the
//   pre-turn git SHA; restore resets the tree to it and, ONLY for GREEN/REFACTOR
//   (the turns that run `alembic upgrade` and mutate the DB), re-forks a clean
//   paired branch. RED/REVIEW do not touch the DB, so restore skips the re-fork ,
//   halving branch churn (the plan's optimization).
//
// Every side-effecting op for a BUILD snapshot is INJECTED (BuildSnapshotDeps),
// so the ordering is unit-tested with no git repo + no cloud. The real deps
// (git reset + cutExperiment re-fork) are wired by the harness.

import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";

/** A restorable snapshot of a DESIGN turn's pre-turn .sftdd tree. */
export interface DesignSnapshot {
  /** Replace the live .sftdd with the captured copy (idempotent). */
  restore(): void;
  /** Remove the backing copy (call once the handoff's winner is chosen). */
  dispose(): void;
}

/** Snapshot the .sftdd tree so a design candidate can be undone. Copies to a
 *  sibling temp dir; restore removes the live tree and copies the backup back. */
export function snapshotDesign(args: { sftddDir: string }): DesignSnapshot {
  const { sftddDir } = args;
  const backup = mkdtempSync(join(tmpdir(), "optimize-design-snap-"));
  const backupTree = join(backup, basename(sftddDir));
  cpSync(sftddDir, backupTree, { recursive: true });
  return {
    restore() {
      rmSync(sftddDir, { recursive: true, force: true });
      cpSync(backupTree, sftddDir, { recursive: true });
    },
    dispose() {
      rmSync(backup, { recursive: true, force: true });
    },
  };
}

/** Injected substrate for a BUILD snapshot, so the reset-then-refork ordering is
 *  hermetically testable. The harness supplies the real git + cutExperiment ops. */
export interface BuildSnapshotDeps {
  /** The current git SHA of the project (pre-turn). */
  captureSha(): Promise<string>;
  /** Hard-reset the working tree to the captured SHA (discarding the candidate's
   *  code changes). */
  resetHard(sha: string): Promise<void>;
  /** Drop + re-fork a clean paired Lakebase child branch (cutExperiment with
   *  resetStaleBranch). Called only when the turn mutated the DB. */
  reFork(): Promise<void>;
}

/** A restorable snapshot of a BUILD turn's pre-turn state. */
export interface BuildSnapshot {
  /** The captured pre-turn git SHA. */
  readonly sha: string;
  /** Restore to the pre-turn state. `reFork:true` (GREEN/REFACTOR) also re-forks a
   *  clean paired branch; `reFork:false` (RED/REVIEW) only resets the tree. */
  restore(opts: { reFork: boolean }): Promise<void>;
}

/** Snapshot a BUILD turn: capture the pre-turn SHA now; restore resets to it and
 *  conditionally re-forks. */
export async function snapshotBuild(
  args: { projectDir: string; sftddDir: string; story: string },
  deps: BuildSnapshotDeps,
): Promise<BuildSnapshot> {
  const sha = await deps.captureSha();
  return {
    sha,
    async restore({ reFork }) {
      await deps.resetHard(sha);
      if (reFork) await deps.reFork();
    },
  };
}

/** Whether a build turn mutates the branch DB (so restore must re-fork). GREEN +
 *  REFACTOR run `alembic upgrade head` against the paired branch; RED + REVIEW do
 *  not. Design turns never do. Used by the harness to decide restore({reFork}). */
export function turnMutatesDb(buildMode: string | undefined, role: string): boolean {
  // Driver GREEN (no explicit buildMode) + any refactor* mode mutate the DB.
  if (buildMode === "green" || buildMode === "refactor" || buildMode === "refactor-deploy" || buildMode === "refactor-superseded" || buildMode === "repair") {
    return true;
  }
  // The plain driver build turn (GREEN) carries no buildMode; the navigator's
  // does (red/review/reflect), none of which mutate the DB.
  return buildMode === undefined && role === "driver";
}

/** Resolve the project root from a sftddDir (the .sftdd's parent), the convention
 *  the drive uses. Exposed so the harness + snapshot agree on the root. */
export function projectDirOf(sftddDir: string): string {
  return dirname(sftddDir);
}
