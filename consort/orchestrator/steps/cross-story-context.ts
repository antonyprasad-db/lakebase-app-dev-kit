// Cross-story design-review context (hardening #1): the deterministic preparer that
// gives the design-lane reviewers (architect-reviewer, navigator reflect) the ONE thing
// they structurally lacked , sight of the FEATURE'S OTHER STORIES. A story was reviewed
// in isolation, so a later story could author an AC that contradicts an earlier, already
// gated story (e.g. S3 "reject a SKU not in stock_records" vs S1 "first receipt of a
// fresh SKU establishes stock"), and no reviewer or gate compared across stories , the
// contradiction surfaced only in the build lane. This assembles the sibling stories'
// acceptance criteria + the architecture's open_decisions so the reviewer can catch the
// conflict (and a story silently resolving a deferred decision) at design time.
//
// Pure + I/O-light off disk => unit-testable off a fixture (the S1/S3 regression). The
// runner injects it as an OPTIONAL `computed:cross-story-context` input, so a turn with no
// siblings / no architecture.json simply gets an empty context (never a hard failure).

import * as fs from "node:fs";
import { basename } from "node:path";
import { storiesDir, storyResolved, storyAcIds, acJson, architectureJson } from "../../config/consort-paths.js";

export interface SiblingAc {
  ac_id: string;
  status?: string;
  layer?: string;
  given?: string;
  when?: string;
  then?: string;
  architectural_notes?: string;
}
export interface SiblingStory {
  story: string;
  acs: SiblingAc[];
}
export interface OpenDecision {
  id: string;
  question?: string;
  decision_status?: string;
  resolved_by_story?: string;
  resolution?: string;
}
export interface CrossStoryContext {
  current_story: string;
  /** Every OTHER story's ACs in this feature (status carried so the reviewer weighs a
   *  gated/approved sibling AC as a hard constraint). */
  sibling_stories: SiblingStory[];
  /** The architecture's deliberately-unresolved decisions (schema `open_decisions`). */
  open_decisions: OpenDecision[];
}

const str = (v: unknown): string | undefined => (typeof v === "string" && v.length > 0 ? v : undefined);

/** Assemble the cross-story review context for `currentStory` in `feature`: the OTHER
 *  stories' ACs + the architecture's open decisions. Never throws; missing pieces yield
 *  empty arrays. */
export function buildCrossStoryContext(consortDir: string, feature: string, currentStory: string): CrossStoryContext {
  const ctx: CrossStoryContext = { current_story: currentStory, sibling_stories: [], open_decisions: [] };

  const currentDir = (() => {
    try {
      return basename(storyResolved(consortDir, feature, currentStory));
    } catch {
      return currentStory;
    }
  })();

  let dirs: string[] = [];
  try {
    dirs = fs.readdirSync(storiesDir(consortDir, feature));
  } catch {
    dirs = [];
  }
  for (const dir of dirs.sort()) {
    if (dir === currentDir) continue; // never fold the story under review into its own sibling context
    const acs: SiblingAc[] = [];
    for (const acId of storyAcIds(consortDir, feature, dir)) {
      try {
        const ac = JSON.parse(fs.readFileSync(acJson(consortDir, feature, dir, acId), "utf8")) as Record<string, unknown>;
        acs.push({
          ac_id: acId,
          status: str(ac.status),
          layer: str(ac.layer),
          given: str(ac.given),
          when: str(ac.when),
          then: str(ac.then),
          architectural_notes: str(ac.architectural_notes),
        });
      } catch {
        /* skip an unreadable/malformed AC file */
      }
    }
    if (acs.length) ctx.sibling_stories.push({ story: dir, acs });
  }

  try {
    const arch = JSON.parse(fs.readFileSync(architectureJson(consortDir, feature), "utf8")) as { open_decisions?: unknown };
    if (Array.isArray(arch.open_decisions)) {
      ctx.open_decisions = arch.open_decisions
        .filter((d): d is Record<string, unknown> => !!d && typeof (d as Record<string, unknown>).id === "string")
        .map((d) => ({
          id: String(d.id),
          question: str(d.question),
          decision_status: str(d.decision_status),
          resolved_by_story: str(d.resolved_by_story),
          resolution: str(d.resolution),
        }));
    }
  } catch {
    /* no architecture.json yet (early design) */
  }
  return ctx;
}

/** The context serialized for injection as a manifest input value. */
export function crossStoryContextJson(consortDir: string, feature: string, story: string): string {
  return JSON.stringify(buildCrossStoryContext(consortDir, feature, story), null, 2);
}
