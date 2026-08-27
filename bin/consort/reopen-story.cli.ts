#!/usr/bin/env node
// consort-reopen-story: send a story back to the design lane for genuine RE-AUTHORING.
// withdraw-gate reverts the gate and revise resets build state, but both LEAVE the story's
// ACs/test-list/reflect-verdict on disk, so the drive just re-approves the same spec. This
// clears those design artifacts (with a backup) so hasAcs=false and the drive re-dispatches
// the Spec Author , the missing recovery primitive the stockflow run had to improvise.
//
//   consort-reopen-story --feature <F> --story <S> [--reason "<why>"] [--project-dir <p>]
//
// It does NOT touch the gate or the experiment branch (those are their own primitives);
// it prints the full recovery sequence so neither is forgotten (an orphaned experiment
// branch is surfaced here rather than silently stranded).

import { resolveConsortDir } from "../../consort/config/consort-paths.js";
import { reopenStoryForRedesign } from "../../consort/gates/reopen-story.js";
import { isCliEntry } from "@databricks-solutions/lakebase-scm-utils/util";

interface Args {
  feature?: string;
  story?: string;
  reason: string;
  projectDir: string;
  consortDir?: string;
}

function parseArgs(argv: string[]): Args {
  const out: Args = { reason: "reopened for redesign", projectDir: process.cwd() };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--feature": out.feature = argv[++i]; break;
      case "--story": out.story = argv[++i]; break;
      case "--reason": out.reason = argv[++i]; break;
      case "--project-dir": out.projectDir = argv[++i]; break;
      case "--tdd-dir": case "--consort-dir": out.consortDir = argv[++i]; break;
      case "-h": case "--help":
        process.stdout.write(
          "consort-reopen-story , clear a story's design artifacts (backed up) so the drive re-authors it.\n\n" +
            "  consort-reopen-story --feature <F> --story <S> [--reason \"<why>\"]\n\n" +
            "Clears acs/, test-list-per-story.json, reflect-verdict.json, plan.json and empties story.json acs[]\n" +
            "so hasAcs=false and the Spec Author is re-dispatched. Backs everything up first. Does NOT touch the\n" +
            "gate or the experiment branch , it prints the full recovery sequence for those.\n",
        );
        process.exit(0);
    }
  }
  return out;
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.feature || !args.story) {
    process.stderr.write("consort-reopen-story: --feature and --story are required.\n");
    return 2;
  }
  const consortDir = args.consortDir ?? resolveConsortDir(args.projectDir);
  const res = reopenStoryForRedesign(consortDir, args.feature, args.story);

  if (!res.cleared.length) {
    process.stdout.write(`consort-reopen-story: ${args.story} had no design artifacts to clear (already needs design).\n`);
    return 0;
  }
  process.stdout.write(`consort-reopen-story: reopened ${args.feature}/${args.story} for redesign.\n`);
  process.stdout.write(`  cleared (backed up to ${res.backupDir}):\n`);
  for (const c of res.cleared) process.stdout.write(`    - ${c}\n`);
  process.stderr.write(
    "\nComplete the reopen (each is a separate, existing primitive , this only cleared the design artifacts):\n" +
      "  1. Withdraw the spec gate if it was approved (drops the story from the build queue).\n" +
      "  2. Discard the story's experiment branch if one exists , do NOT leave it orphaned.\n" +
      "  3. Re-run the drive: hasAcs is now false, so it re-dispatches the Spec Author -> Architect -> DBA ->\n" +
      "     Test Strategist -> reflect -> the spec gate (a genuine re-author, not a re-approval).\n",
  );
  return 0;
}

if (isCliEntry(import.meta.url)) {
  main().then((code) => process.exit(code)).catch((e) => {
    process.stderr.write(`consort-reopen-story: ${e instanceof Error ? e.message : String(e)}\n`);
    process.exit(1);
  });
}
