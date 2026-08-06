// Auto-migration for the artifact root rename (legacy -> .consort).
//
// WHY THIS EXISTS: the workflow's on-disk artifact directory was renamed over
// time (".tdd" -> ".sftdd" -> ".consort", the last to match the Consort skill).
// Existing projects still have a legacy dir. Rather than force a manual
// migration, the orchestrator calls migrateLegacyArtifactDir() on entry: the
// newest legacy root present (".sftdd", else ".tdd") is renamed to ".consort"
// in place on the next run, preserving git history when the project is a git
// repo. Idempotent and safe: a no-op once ".consort" exists or when no legacy
// root is present.

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import { join } from "node:path";

import { ARTIFACT_ROOT, LEGACY_ARTIFACT_ROOTS } from "../../consort/config/consort-paths.js";

export interface MigrationResult {
  /** True only when a legacy root was renamed to ".consort" on this call. */
  migrated: boolean;
  /** The resolved artifact-root path after the call. */
  root: string;
  /** "git" when git mv preserved history, "fs" for a plain rename, undefined when no migration happened. */
  via?: "git" | "fs";
}

function isGitRepo(projectDir: string): boolean {
  return fs.existsSync(join(projectDir, ".git"));
}

/** Rewrite a project's .gitignore entries that point at ANY legacy root so a
 *  freshly migrated ".consort" keeps the same ignore rules (e.g. the per-run
 *  agent-log + run-config). Only lines whose path segment is a legacy root are
 *  touched; everything else is preserved verbatim. No-op when absent. */
function rewriteGitignore(projectDir: string): void {
  const gi = join(projectDir, ".gitignore");
  if (!fs.existsSync(gi)) return;
  const before = fs.readFileSync(gi, "utf8");
  let after = before;
  for (const legacyName of LEGACY_ARTIFACT_ROOTS) {
    after = after.replace(
      new RegExp(`(^|\\s)${legacyName.replace(".", "\\.")}/`, "gm"),
      `$1${ARTIFACT_ROOT}/`,
    );
  }
  if (after !== before) fs.writeFileSync(gi, after);
}

/** Rename the newest legacy artifact dir (".sftdd", else ".tdd") to ".consort"
 *  when the new one does not yet exist. Prefers `git mv` so history follows the
 *  rename; falls back to a filesystem rename. No-op (migrated: false) when
 *  ".consort" already exists or when there is no legacy root to migrate. */
export function migrateLegacyArtifactDir(projectDir: string = process.cwd()): MigrationResult {
  const next = join(projectDir, ARTIFACT_ROOT);

  if (fs.existsSync(next)) return { migrated: false, root: next };
  const legacyName = LEGACY_ARTIFACT_ROOTS.find((name) => fs.existsSync(join(projectDir, name)));
  if (!legacyName) return { migrated: false, root: next };
  const legacy = join(projectDir, legacyName);

  if (isGitRepo(projectDir)) {
    try {
      execFileSync("git", ["mv", legacyName, ARTIFACT_ROOT], {
        cwd: projectDir,
        stdio: "ignore",
      });
      rewriteGitignore(projectDir);
      return { migrated: true, root: next, via: "git" };
    } catch {
      // git mv can fail (e.g. the dir was never tracked); fall through to fs.
    }
  }

  fs.renameSync(legacy, next);
  rewriteGitignore(projectDir);
  return { migrated: true, root: next, via: "fs" };
}
