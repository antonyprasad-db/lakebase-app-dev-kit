// Resolve the human-reviewable artifacts the Consort roles produce, so they can be
// opened in the editor at a gate instead of the human hunting for them. Returns only
// files that EXIST, in review order (design/planning context first, then the
// feature's spec/architecture, then the story's spec/ACs/test-list). Pure + I/O-light
// => unit-testable off a fixture.

import * as fs from "node:fs";
import { join } from "node:path";
import {
  designBriefMd,
  designGuideJson,
  featureProposalsMd,
  featureRequestMd,
  featureSpecMd,
  featureSpecJson,
  architectureMd,
  architectureJson,
  dbDesignMd,
  dbDesignJson,
  featureTestListJson,
  storyDir,
  storyJson,
  storyTestListJson,
  acsDir,
} from "../../config/consort-paths.js";

/** The reviewable artifacts for a scope, existing-only, deduped, in review order.
 *  No feature => the planning/design review set (proposals + brief + guide). */
export function reviewArtifacts(consortDir: string, opts: { feature?: string; story?: string } = {}): string[] {
  const out: string[] = [];
  const add = (p: string): void => {
    if (fs.existsSync(p) && !out.includes(p)) out.push(p);
  };

  // Design + planning context (relevant at every review).
  add(featureProposalsMd(consortDir));
  add(designBriefMd(consortDir));
  add(designGuideJson(consortDir));

  const { feature: f, story: s } = opts;
  if (f) {
    add(featureRequestMd(consortDir, f));
    add(featureSpecMd(consortDir, f));
    add(featureSpecJson(consortDir, f));
    add(architectureMd(consortDir, f));
    add(architectureJson(consortDir, f));
    add(dbDesignMd(consortDir, f));
    add(dbDesignJson(consortDir, f));
    add(featureTestListJson(consortDir, f));
    if (s) {
      add(join(storyDir(consortDir, f, s), "story.md"));
      add(storyJson(consortDir, f, s));
      add(storyTestListJson(consortDir, f, s));
      try {
        for (const a of fs.readdirSync(acsDir(consortDir, f, s)).filter((n) => n.endsWith(".json")).sort()) {
          add(join(acsDir(consortDir, f, s), a));
        }
      } catch {
        /* no acs dir yet */
      }
    }
  }
  return out;
}
