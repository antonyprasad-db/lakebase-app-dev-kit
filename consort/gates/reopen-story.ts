// Reopen a story for genuine RE-DESIGN (hardening #4, recovery). The kit had no clean way
// to send a story back to the design lane: withdraw-gate reverts the gate + drops the story
// from the build queue, and revise resets build state, but BOTH leave the story's design
// artifacts (ACs, test-list, reflect-verdict) on disk , so the drive sees the story as
// already-designed (hasAcs=true) and merely wants to RE-APPROVE the same, still-conflicting
// spec. To make the roles genuinely re-author, those artifacts must be cleared. This does
// that, with a backup (the .consort artifacts are untracked, so a copy is the only safety
// net) , the primitive the stockflow recovery had to improvise by hand.
//
// hasAcs = storyAcIds().length > 0, and storyAcIds reads BOTH story.json.acs[] AND the acs/
// dir, so clearing the dir alone can leave hasAcs=true; we also empty story.json.acs[]. The
// story shell (id/title/asA/iWantTo/soThat) is preserved so the story still exists , only
// its design output is reverted. Filesystem-only + deterministic (injectable clock) => the
// gate/experiment teardown stay their own existing primitives (withdraw-gate, discard).

import * as fs from "node:fs";
import { basename, dirname, join } from "node:path";
import {
  acsDir,
  storyTestListJson,
  reflectVerdictJson,
  storyPlanJson,
  storyJson,
  storyResolved,
} from "../config/consort-paths.js";

export interface ReopenResult {
  /** Where the cleared artifacts were copied before removal. */
  backupDir: string;
  /** The story-relative paths that were cleared/reverted. */
  cleared: string[];
}

/** Back up + clear a story's design artifacts so the drive re-dispatches the Spec Author
 *  (hasAcs=false) instead of re-approving a stale spec. Never throws on a missing artifact
 *  (each is optional); returns what it did. */
export function reopenStoryForRedesign(
  consortDir: string,
  feature: string,
  story: string,
  opts: { now?: () => Date } = {},
): ReopenResult {
  const now = opts.now ?? (() => new Date());
  const storyRoot = storyResolved(consortDir, feature, story);
  const stamp = now().toISOString().replace(/[:.]/g, "-");
  const backupDir = join(consortDir, `.backup-${basename(storyRoot)}-redesign-${stamp}`);
  const cleared: string[] = [];

  const rel = (p: string): string => p.slice(storyRoot.length).replace(/^[/\\]/, "") || basename(p);
  const backup = (p: string): void => {
    const dest = join(backupDir, rel(p));
    fs.mkdirSync(dirname(dest), { recursive: true });
    fs.cpSync(p, dest, { recursive: true });
  };

  // 1. Remove the design artifacts (backed up) so the story reverts to "needs design".
  for (const p of [
    acsDir(consortDir, feature, story),
    storyTestListJson(consortDir, feature, story),
    reflectVerdictJson(consortDir, feature, story),
    storyPlanJson(consortDir, feature, story),
  ]) {
    if (!fs.existsSync(p)) continue;
    backup(p);
    fs.rmSync(p, { recursive: true, force: true });
    cleared.push(rel(p));
  }

  // 2. hasAcs also counts story.json.acs[]; empty it (backed up), preserving every other
  //    field, so hasAcs is DEFINITIVELY false and the drive re-dispatches the Spec Author.
  const sj = storyJson(consortDir, feature, story);
  if (fs.existsSync(sj)) {
    try {
      const obj = JSON.parse(fs.readFileSync(sj, "utf8")) as Record<string, unknown>;
      if (Array.isArray(obj.acs) && obj.acs.length > 0) {
        backup(sj);
        fs.writeFileSync(sj, JSON.stringify({ ...obj, acs: [] }, null, 2) + "\n");
        cleared.push(rel(sj) + " (acs[] emptied)");
      }
    } catch {
      /* leave a malformed story.json untouched */
    }
  }

  return { backupDir, cleared };
}
