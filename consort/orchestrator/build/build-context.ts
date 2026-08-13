// build-context: the pre-extracted design CONTEXT PACK a BUILD turn (navigator/driver:
// RED / GREEN / REVIEW / REFACTOR / assess) is handed inline, so a fresh-session heavy role
// does NOT reload architecture.md + nfrs.md + design-guide.md IN FULL, nor find/grep/ls to
// relocate the module layout + test dirs every turn (the recorded worst GREEN spent ~37 of 93
// tool round-trips just relocating context already on disk). All of it is a DETERMINISTIC
// projection of the design artifacts + conventions.json, never authored, so it cannot drift.
//
// This lives in the orchestrator family as the ONE source of truth: the real drive
// (consort/orchestrator/drive/orchestrator-effects.ts, roleTaskBody) imports it, AND the lean per-role build
// chains (optimize/build-role-chains.ts) inject the SAME pack, so an isolated build turn is
// pre-conditioned exactly as the dispatched turn is (no hand-written approximation).

import * as fs from "node:fs";
import { readConventions } from "../../architecture/architecture-conventions.js";
import { storyAcIds, readAcLayer, architectureJson, designGuideJson } from "../../config/consort-paths.js";

/** The .consort artifact root for a project (identity: the artifact dir IS the root). */
function artifactRoot(consortDir: string): string {
  return consortDir;
}

/**
 * A compact, pre-extracted design rubric the orchestrator computes ONCE from the
 * design artifacts and passes inline to a BUILD turn (RED / GREEN / REVIEW /
 * REFACTOR), so the Navigator + Driver do not reload `architecture.md` +
 * `nfrs.md` + `design-guide.md` IN FULL every turn (the same 3 files, re-read
 * on each RED/GREEN/REVIEW/REFACTOR across a story). Same data, pre-extracted:
 *   - the `layer`(s) the code must respect: the single AC's layer in ac-loop, or
 *     the UNION across the story's ACs at story scope (ac === ""),
 *   - the NFRs that apply to this story or feature-wide (id + brief), from
 *     architecture.json (the canonical NFR home), and
 *   - for UI (E2E) work, the design-token groups to check, from design-guide.json.
 * Best-effort: any unreadable / absent source is simply omitted (the prompt
 * still names the full files for when more detail than the rubric is needed).
 * Returns "" when nothing could be extracted (the prompt then degrades to naming
 * the full files, the prior behavior). This is the per-role context-compaction
 * lever: inject the slice, do not make each turn re-read the whole design tree.
 */
function contextRubric(consortDir: string, featureId: string, story: string, ac: string): string {
  const parts: string[] = [];

  // Layer(s): the single AC in ac-loop; the union across the story's ACs at
  // story scope (so a story-level RED/GREEN/REVIEW/REFACTOR sees every boundary
  // its tests/code span, not just one).
  const layers = new Set<string>();
  const acIds = ac ? [ac] : storyAcIds(consortDir, featureId, story);
  for (const id of acIds) {
    const l = readAcLayer(consortDir, featureId, id);
    if (l) layers.add(l);
  }
  if (layers.size) parts.push(`layer${layers.size > 1 ? "s" : ""}=${[...layers].join(", ")}`);

  // NFRs scoped to this story or applied feature-wide (applies_to === featureId).
  try {
    const arch = JSON.parse(fs.readFileSync(architectureJson(consortDir, featureId), "utf8")) as {
      nfrs?: Array<{ id?: string; brief?: string; applies_to?: string }>;
    };
    const nfrs = (arch.nfrs ?? []).filter(
      (n) => n && typeof n.id === "string" && (n.applies_to === story || n.applies_to === featureId),
    );
    if (nfrs.length) {
      parts.push(`required NFRs, ${nfrs.map((n) => `${n.id}${n.brief ? ` (${n.brief})` : ""}`).join("; ")}`);
    }
  } catch {
    /* no architecture.json -> omit; prompt still names nfrs.md */
  }

  // Design-token groups to check, only when UI (E2E) work is in scope, the
  // non-UI majority need NO design-guide read at all.
  if (layers.has("E2E")) {
    try {
      const dg = JSON.parse(fs.readFileSync(designGuideJson(consortDir), "utf8")) as {
        tokens?: Record<string, unknown>;
      };
      const groups = Object.keys(dg.tokens ?? (dg as Record<string, unknown>));
      if (groups.length) parts.push(`design-token groups, ${groups.join(", ")}`);
    } catch {
      /* omit */
    }
  }

  return parts.length ? ` RUBRIC (pre-extracted; judge against THIS) :: ${parts.join(" | ")}.` : "";
}

/** The shared "prefer the pre-extracted rubric; open the full files only if you
 *  need more detail" note appended after a non-empty `contextRubric`. Uses the
 *  hyphenated `design-guide.md` filename only (never the phrase "design guide"),
 *  so a RED/GREEN turn's note does not read as the UI-track design-guide input
 *  flag. Returns "" when the rubric was empty (nothing pre-extracted to prefer). */
function rubricSourcesNote(rubric: string, featureId: string, root: string): string {
  if (!rubric) return "";
  return (
    ` The rubric above is pre-extracted from ${root}/features/${featureId}/architecture.md, ${root}/nfrs.md,` +
    ` and ${root}/design/design-guide.md, open those full files ONLY if you need more detail than it carries` +
    ` (do not re-read them by default).`
  );
}

/**
 * The build turn's CONTEXT PACK: rubric (layers + NFRs + UI tokens) PLUS the
 * established module layout and where the story's tests live. A heavy role
 * (Driver / Navigator) starts EVERY turn on a FRESH session (no warm context),
 * so anything it is not TOLD it must rediscover , and the recorded worst GREEN
 * turn spent 93 tool round-trips, ~37 of them just `find`/`grep`/`ls`/`Read`
 * relocating context already on disk. Injecting the layout + test locations
 * turns that discovery into zero round-trips. All of it is a deterministic
 * projection of the artifacts (conventions.json + the scaffold's fixed test
 * dirs), never authored, so it cannot drift. Best-effort: an absent piece is
 * simply omitted. `skipTestLoop` drops the test-location + iterate line for turns
 * that do not run the build test loop (RED has no code yet; REVIEW only judges).
 */
function buildContextPack(
  consortDir: string,
  featureId: string,
  story: string,
  ac: string,
  opts: { skipTestLoop?: boolean } = {},
): string {
  const root = artifactRoot(consortDir);
  const rubric = contextRubric(consortDir, featureId, story, ac);
  const parts: string[] = [];
  if (rubric) parts.push(rubric + rubricSourcesNote(rubric, featureId, root));

  // Module layout: the established role -> path map, so the Driver PLACES code
  // (and the Navigator/Reviewer JUDGES placement) without probing the tree.
  const conventions = readConventions(consortDir);
  if (conventions?.layers?.length) {
    const layout = conventions.layers
      .map((l) => `${l.role}=${l.module}${l.renders_via ? ` (${l.renders_via})` : ""}`)
      .join(" | ");
    parts.push(` LAYOUT (place/judge code at THESE paths, do not scan for them) :: ${layout}.`);
  }

  // Test locations: the scaffold fixes these dirs, so a build turn never needs
  // to `find`/`ls` for the story's tests. Behavior + fitness live in known dirs;
  // e2e is owned by the deploy gate, never re-run per cycle here.
  if (!opts.skipTestLoop) {
    parts.push(
      ` TESTS :: this story's tests are under tests/step_defs/ (behavior, one file per story) and` +
        ` tests/architecture/ (fitness: layering, persistence invariants, migration reversibility). Read those` +
        ` named paths directly; do NOT find/grep/ls to locate them. Iterate against the single failing test while` +
        ` fixing; the honest-GREEN verify is the authoritative full run.`,
    );
  }

  return parts.join("");
}

export { contextRubric, rubricSourcesNote, buildContextPack };
