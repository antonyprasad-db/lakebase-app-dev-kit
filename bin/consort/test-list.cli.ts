#!/usr/bin/env node
// CLI: regenerate per-AC views from a feature's master test list, or, when a
// storyId is given, write that story's scoped per-story test list (the
// streaming build lane's per-story input).

import { readMasterTestList, writePerAcViews, writeStoryTestList } from "../../consort/test-list/test-list.js";
import { resolveConsortDir } from "../../consort/config/consort-paths.js";

function main(): number {
  const [consortDir = resolveConsortDir(), featureId, storyId] = process.argv.slice(2);
  if (!featureId) {
    process.stderr.write("usage: test-list <consortDir> <featureId> [storyId]\n");
    return 1;
  }
  if (storyId) {
    const file = writeStoryTestList(consortDir, featureId, storyId);
    if (!file) {
      process.stderr.write(`story ${storyId} not found under ${featureId}\n`);
      return 1;
    }
    process.stdout.write(`wrote ${file}\n`);
    return 0;
  }
  const list = readMasterTestList(consortDir, featureId);
  const written = writePerAcViews(consortDir, featureId, list);
  for (const f of written) process.stdout.write(`wrote ${f}\n`);
  return 0;
}

try {
  process.exit(main());
} catch (err) {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
}
