#!/usr/bin/env node

// consort/config/consort-paths.ts
import * as fs from "fs";
import { join } from "path";
var ARTIFACT_ROOT = ".consort";
var LEGACY_ARTIFACT_ROOTS = [".sftdd", ".tdd"];
var ALL_ARTIFACT_ROOTS = [ARTIFACT_ROOT, ...LEGACY_ARTIFACT_ROOTS];
function resolveConsortDir(projectDir = process.cwd()) {
  const next = join(projectDir, ARTIFACT_ROOT);
  if (fs.existsSync(next)) return next;
  for (const legacyName of LEGACY_ARTIFACT_ROOTS) {
    const legacy = join(projectDir, legacyName);
    if (fs.existsSync(legacy)) return legacy;
  }
  return next;
}
var featuresDir = (tdd) => join(tdd, "features");
var featureDir = (tdd, featureId) => join(featuresDir(tdd), featureId);
var featureResolved = (tdd, f) => findFeatureDir(tdd, f) ?? featureDir(tdd, f);
var storiesDir = (tdd, f) => join(featureResolved(tdd, f), "stories");
var storyDir = (tdd, f, s) => join(storiesDir(tdd, f), s);
function findStoryDir(tdd, f, s) {
  const root = storiesDir(tdd, f);
  if (!fs.existsSync(root)) return void 0;
  const exact = join(root, s);
  if (fs.existsSync(exact)) return exact;
  const matches = fs.readdirSync(root).filter((d) => d === s || d.startsWith(`${s}-`));
  return matches.length === 1 ? join(root, matches[0]) : void 0;
}
var storyResolved = (tdd, f, s) => findStoryDir(tdd, f, s) ?? storyDir(tdd, f, s);
var storyJson = (tdd, f, s) => join(storyResolved(tdd, f, s), "story.json");
var acsDir = (tdd, f, s) => join(storyResolved(tdd, f, s), "acs");
var storyTestListJson = (tdd, f, s) => join(storyResolved(tdd, f, s), "test-list-per-story.json");
var storyPlanJson = (tdd, f, s) => join(storyResolved(tdd, f, s), "plan.json");
var reflectVerdictJson = (tdd, f, s) => join(storyResolved(tdd, f, s), "reflect-verdict.json");
function findFeatureDir(tdd, featureId) {
  const root = featuresDir(tdd);
  if (!fs.existsSync(root)) return void 0;
  const exact = join(root, featureId);
  if (fs.existsSync(exact)) return exact;
  const matches = fs.readdirSync(root).filter((d) => d === featureId || d.startsWith(`${featureId}-`));
  return matches.length === 1 ? join(root, matches[0]) : void 0;
}

// consort/gates/reopen-story.ts
import * as fs2 from "fs";
import { basename, dirname, join as join2 } from "path";
function reopenStoryForRedesign(consortDir, feature, story, opts = {}) {
  const now = opts.now ?? (() => /* @__PURE__ */ new Date());
  const storyRoot = storyResolved(consortDir, feature, story);
  const stamp = now().toISOString().replace(/[:.]/g, "-");
  const backupDir = join2(consortDir, `.backup-${basename(storyRoot)}-redesign-${stamp}`);
  const cleared = [];
  const rel = (p) => p.slice(storyRoot.length).replace(/^[/\\]/, "") || basename(p);
  const backup = (p) => {
    const dest = join2(backupDir, rel(p));
    fs2.mkdirSync(dirname(dest), { recursive: true });
    fs2.cpSync(p, dest, { recursive: true });
  };
  for (const p of [
    acsDir(consortDir, feature, story),
    storyTestListJson(consortDir, feature, story),
    reflectVerdictJson(consortDir, feature, story),
    storyPlanJson(consortDir, feature, story)
  ]) {
    if (!fs2.existsSync(p)) continue;
    backup(p);
    fs2.rmSync(p, { recursive: true, force: true });
    cleared.push(rel(p));
  }
  const sj = storyJson(consortDir, feature, story);
  if (fs2.existsSync(sj)) {
    try {
      const obj = JSON.parse(fs2.readFileSync(sj, "utf8"));
      if (Array.isArray(obj.acs) && obj.acs.length > 0) {
        backup(sj);
        fs2.writeFileSync(sj, JSON.stringify({ ...obj, acs: [] }, null, 2) + "\n");
        cleared.push(rel(sj) + " (acs[] emptied)");
      }
    } catch {
    }
  }
  return { backupDir, cleared };
}

// bin/consort/reopen-story.cli.ts
import { isCliEntry } from "@databricks-solutions/lakebase-scm-utils/util";
function parseArgs(argv) {
  const out = { reason: "reopened for redesign", projectDir: process.cwd() };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--feature":
        out.feature = argv[++i];
        break;
      case "--story":
        out.story = argv[++i];
        break;
      case "--reason":
        out.reason = argv[++i];
        break;
      case "--project-dir":
        out.projectDir = argv[++i];
        break;
      case "--tdd-dir":
      case "--consort-dir":
        out.consortDir = argv[++i];
        break;
      case "-h":
      case "--help":
        process.stdout.write(
          `consort-reopen-story , clear a story's design artifacts (backed up) so the drive re-authors it.

  consort-reopen-story --feature <F> --story <S> [--reason "<why>"]

Clears acs/, test-list-per-story.json, reflect-verdict.json, plan.json and empties story.json acs[]
so hasAcs=false and the Spec Author is re-dispatched. Backs everything up first. Does NOT touch the
gate or the experiment branch , it prints the full recovery sequence for those.
`
        );
        process.exit(0);
    }
  }
  return out;
}
async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.feature || !args.story) {
    process.stderr.write("consort-reopen-story: --feature and --story are required.\n");
    return 2;
  }
  const consortDir = args.consortDir ?? resolveConsortDir(args.projectDir);
  const res = reopenStoryForRedesign(consortDir, args.feature, args.story);
  if (!res.cleared.length) {
    process.stdout.write(`consort-reopen-story: ${args.story} had no design artifacts to clear (already needs design).
`);
    return 0;
  }
  process.stdout.write(`consort-reopen-story: reopened ${args.feature}/${args.story} for redesign.
`);
  process.stdout.write(`  cleared (backed up to ${res.backupDir}):
`);
  for (const c of res.cleared) process.stdout.write(`    - ${c}
`);
  process.stderr.write(
    "\nComplete the reopen (each is a separate, existing primitive , this only cleared the design artifacts):\n  1. Withdraw the spec gate if it was approved (drops the story from the build queue).\n  2. Discard the story's experiment branch if one exists , do NOT leave it orphaned.\n  3. Re-run the drive: hasAcs is now false, so it re-dispatches the Spec Author -> Architect -> DBA ->\n     Test Strategist -> reflect -> the spec gate (a genuine re-author, not a re-approval).\n"
  );
  return 0;
}
if (isCliEntry(import.meta.url)) {
  main().then((code) => process.exit(code)).catch((e) => {
    process.stderr.write(`consort-reopen-story: ${e instanceof Error ? e.message : String(e)}
`);
    process.exit(1);
  });
}
//# sourceMappingURL=reopen-story.cli.js.map