// Resolve the human-reviewable artifacts the Consort roles produce, so they can be
// opened in the editor at a gate instead of the human hunting for them. Returns only
// files that EXIST, in review order (design/planning context first, then the
// feature's spec/architecture, then the story's spec/ACs/test-list). Pure + I/O-light
// => unit-testable off a fixture.

import * as fs from "node:fs";
import { join } from "node:path";
import {
  productOverviewMd,
  nfrsMd,
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
  featureTestListMd,
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

  // Product + design + planning context (relevant at every review).
  add(productOverviewMd(consortDir));
  add(nfrsMd(consortDir));
  add(featureProposalsMd(consortDir));
  add(join(consortDir, "planning", "estimates.json")); // architect-estimator: the t-shirt sizes the PO commits from
  add(designBriefMd(consortDir));
  add(join(consortDir, "design", "design-guide.md")); // ux-designer narrative (the reviewable one)
  add(designGuideJson(consortDir));
  add(join(consortDir, "design", "ia.md")); // ux-designer IA: screens + navigation + flows

  const { feature: f, story: s } = opts;
  if (f) {
    add(featureRequestMd(consortDir, f));
    add(featureSpecMd(consortDir, f));
    add(featureSpecJson(consortDir, f));
    add(architectureMd(consortDir, f));
    add(architectureJson(consortDir, f));
    add(dbDesignMd(consortDir, f));
    add(dbDesignJson(consortDir, f));
    add(featureTestListMd(consortDir, f)); // rendered test list (human-readable)
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

/** The design roles that PRODUCE reviewable artifacts. A turn-done for one of these with
 *  nothing to open is worth reporting (scope/timing); a build turn (driver) opening nothing
 *  is expected + stays silent. Slugs match the telemetry ROLE_VALUES closed enum. */
export const DESIGN_ROLES: ReadonlySet<string> = new Set([
  "product-owner",
  "spec-author",
  "architect-reviewer",
  "dba",
  "ux-designer",
  "test-strategist",
  "navigator",
]);

/** The reviewable artifacts a SPECIFIC role produces this turn, existing-only, in review
 *  order , so the per-turn open reveals exactly what the role that just finished authored
 *  (not the whole review set). Empty for `driver` (build turns emit code, no design artifact)
 *  and for any role with no output yet. Scope comes from the live workflow-state feature/story. */
export function roleArtifacts(consortDir: string, role: string, opts: { feature?: string; story?: string } = {}): string[] {
  const { feature: f, story: s } = opts;
  const out: string[] = [];
  const add = (p: string): void => {
    if (fs.existsSync(p) && !out.includes(p)) out.push(p);
  };
  switch (role) {
    case "product-owner":
      add(productOverviewMd(consortDir));
      add(nfrsMd(consortDir));
      add(featureProposalsMd(consortDir));
      break;
    case "spec-author":
      if (f) {
        add(featureSpecMd(consortDir, f));
        add(featureSpecJson(consortDir, f));
      }
      if (f && s) {
        add(join(storyDir(consortDir, f, s), "story.md"));
        add(storyJson(consortDir, f, s));
        try {
          for (const a of fs.readdirSync(acsDir(consortDir, f, s)).filter((n) => n.endsWith(".json")).sort()) {
            add(join(acsDir(consortDir, f, s), a));
          }
        } catch {
          /* no acs dir yet */
        }
      }
      break;
    case "architect-reviewer":
      if (f) {
        add(architectureMd(consortDir, f));
        add(architectureJson(consortDir, f));
      }
      break;
    case "dba":
      if (f) {
        add(dbDesignMd(consortDir, f));
        add(dbDesignJson(consortDir, f));
      }
      break;
    case "ux-designer":
      add(join(consortDir, "design", "design-guide.md"));
      add(designGuideJson(consortDir));
      add(join(consortDir, "design", "ia.md"));
      add(designBriefMd(consortDir));
      break;
    case "test-strategist":
      if (f) {
        add(featureTestListMd(consortDir, f));
        add(featureTestListJson(consortDir, f));
      }
      if (f && s) add(storyTestListJson(consortDir, f, s));
      break;
    case "navigator":
      // reflect: the story under review , what's going into the gate the human is about to
      // approve, so they see the reflected design (not the reflect verdict itself).
      if (f && s) {
        add(join(storyDir(consortDir, f, s), "story.md"));
        add(storyJson(consortDir, f, s));
      }
      break;
    default:
      break; // driver + anything else: no reviewable design artifact
  }
  return out;
}
