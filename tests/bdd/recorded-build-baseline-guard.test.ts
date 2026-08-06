// HERMETIC guard over the recorded-BUILD corpora (the per-turn CODE baselines a build-turn sweep
// scores its candidates against). Design turns produce a discrete artifact whose baseline lives in
// recorded-artifacts/ (guarded by the per-role baseline test in the integration suite); BUILD turns
// (navigator RED/review/assess, driver GREEN/refactor/repair) produce a CODE TREE, and the baseline
// is the full source tree snapshotted at that turn under:
//   recorded-build/features/<F>/stories/<S>/turns/<NNN>-<label>/code/<tree>
//
// This guard proves, without spawning anything, that EVERY recorded build turn is usable as a
// functional baseline for a sweep: (1) its dir carries a non-empty code/ subtree, and (2) its label
// parses to a role + a recognized BuildTurn family (or navigator-reflect, the design-lane critic
// that legitimately has no build key). So a build-turn sweep can never be pointed at a turn whose
// baseline is missing or whose type we can't classify , that gap fails a test rather than the sweep
// silently skipping (the same discipline the design-role baseline guard enforces).
//
// The label->family map mirrors turnKeyForAction (orchestrator-effects.ts) EXACTLY , the recorded
// dir name is labelForAction's `${role}-${mode}` (+ an AC suffix on per-AC self-heal turns), so the
// family keyword is derivable from the tokens after the role. If turnKeyForAction gains a buildMode,
// add it here too (the test names the source so the coupling is explicit).

import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { buildOutputKind, type BuildOutputKind } from "../../consort/evaluation/semantic-gate";

const KIT = process.cwd();
const SCENARIOS = join(KIT, "examples/sftdd-scenarios");

/** The recognized BuildTurn families a label can name, mirroring turnKeyForAction. `undefined`
 *  is the navigator-reflect critic (a real, valid turn with no build key). A label that yields
 *  neither is an UNCLASSIFIABLE turn , the guard fails on it. */
type BuildFamily = "red" | "green" | "review" | "refactor" | "assess" | "repair";

/** Parse a recorded-build turn dir label (`<NNN>-<role>[-<mode>][-<ac...>]`) into its role + the
 *  BuildTurn family, faithful to labelForAction + turnKeyForAction. Returns null when the leading
 *  token is not a build role (navigator/driver) , i.e. not a build turn at all. */
export function parseBuildTurnLabel(dirName: string): { role: string; family: BuildFamily | undefined } | null {
  const withoutOrdinal = dirName.replace(/^\d+-/, "");
  const tokens = withoutOrdinal.split("-");
  const role = tokens[0];
  const rest = tokens.slice(1);
  const has = (kw: string): boolean => rest.includes(kw);

  if (role === "navigator") {
    if (has("reflect")) return { role, family: undefined }; // design-lane critic, no build key
    if (has("review")) return { role, family: "review" };
    if (has("assess")) return { role, family: "assess" }; // assess / assess-deploy / assess-refactor
    return { role, family: "red" }; // plain navigator = RED
  }
  if (role === "driver") {
    if (has("refactor")) return { role, family: "refactor" }; // refactor / -deploy / -superseded
    if (has("repair")) return { role, family: "repair" };
    if (has("green")) return { role, family: "green" }; // green-superseded
    return { role, family: "green" }; // plain driver = GREEN
  }
  return null; // not a build role
}

/** Every recorded-build corpus on disk (each has features/<F>/stories/<S>/turns/<NNN>-<label>/). */
function recordedBuildCorpora(): string[] {
  if (!existsSync(SCENARIOS)) return [];
  return readdirSync(SCENARIOS).filter((c) => existsSync(join(SCENARIOS, c, "recorded-build")));
}

/** Enumerate every recorded build-turn dir across all corpora: {corpus, feature, story, turn, abs}. */
function everyBuildTurnDir(): Array<{ corpus: string; feature: string; story: string; turn: string; abs: string }> {
  const out: Array<{ corpus: string; feature: string; story: string; turn: string; abs: string }> = [];
  for (const corpus of recordedBuildCorpora()) {
    const featuresRoot = join(SCENARIOS, corpus, "recorded-build", "features");
    if (!existsSync(featuresRoot)) continue;
    for (const feature of readdirSync(featuresRoot)) {
      const storiesRoot = join(featuresRoot, feature, "stories");
      if (!existsSync(storiesRoot)) continue;
      for (const story of readdirSync(storiesRoot)) {
        const turnsRoot = join(storiesRoot, story, "turns");
        if (!existsSync(turnsRoot)) continue;
        for (const turn of readdirSync(turnsRoot)) {
          const abs = join(turnsRoot, turn);
          if (statSync(abs).isDirectory()) out.push({ corpus, feature, story, turn, abs });
        }
      }
    }
  }
  return out;
}

/** A directory's tree is non-empty (has at least one file, recursively). */
function hasFiles(dir: string): boolean {
  if (!existsSync(dir)) return false;
  for (const e of readdirSync(dir)) {
    const abs = join(dir, e);
    if (statSync(abs).isDirectory()) {
      if (hasFiles(abs)) return true;
    } else {
      return true;
    }
  }
  return false;
}

// The label parser is the coupling point to turnKeyForAction; unit it directly so a drift in the
// family map is caught even before the corpus scan.
describe("parseBuildTurnLabel: recorded-build dir label -> role + BuildTurn family (mirrors turnKeyForAction)", () => {
  it.each([
    ["002-navigator", "navigator", "red"],
    ["003-driver", "driver", "green"],
    ["006-navigator-review", "navigator", "review"],
    ["011-driver-refactor", "driver", "refactor"],
    ["004-navigator-assess-AC1-batch-serial-columns-added", "navigator", "assess"],
    ["005-driver-green-superseded", "driver", "green"],
    ["007-driver-repair-AC1-split-fields-shown", "driver", "repair"],
  ])("%s -> %s / %s", (dir, role, family) => {
    const p = parseBuildTurnLabel(dir);
    expect(p?.role).toBe(role);
    expect(p?.family).toBe(family);
  });

  it("navigator-reflect is a VALID build-turn dir with no build family (design-lane critic)", () => {
    const p = parseBuildTurnLabel("001-navigator-reflect");
    expect(p?.role).toBe("navigator");
    expect(p?.family).toBeUndefined();
  });

  it("a non-build label (e.g. a gate) is not a build turn", () => {
    expect(parseBuildTurnLabel("012-gate-deploy")).toBeNull();
  });
});

describe("recorded-build corpus: every build turn is a usable functional baseline", () => {
  const turns = everyBuildTurnDir();

  it("there is at least one recorded build turn to guard (corpus present)", () => {
    expect(turns.length).toBeGreaterThan(0);
  });

  it.each(turns.map((t) => [`${t.corpus}/${t.feature}/${t.story}/${t.turn}`, t] as const))(
    "%s carries a non-empty code/ baseline",
    (_id, t) => {
      const codeDir = join(t.abs, "code");
      expect(existsSync(codeDir), `${_id}: no code/ subtree , build-turn sweep would have no baseline`).toBe(true);
      expect(hasFiles(codeDir), `${_id}: code/ is empty`).toBe(true);
    },
  );

  it.each(turns.map((t) => [`${t.corpus}/${t.feature}/${t.story}/${t.turn}`, t] as const))(
    "%s label parses to a build role + a known BuildTurn family (or reflect)",
    (_id, t) => {
      const parsed = parseBuildTurnLabel(t.turn);
      expect(parsed, `${_id}: label does not parse to a build role , unclassifiable turn`).not.toBeNull();
      // family is a known BuildFamily OR undefined (reflect). The parser never returns an unknown
      // string, so asserting role is a build role + parse succeeded is the classification proof.
      expect(["navigator", "driver"]).toContain(parsed!.role);
      // A navigator turn's output is TESTS, a driver's is CODE , buildOutputKind must classify it
      // (the sweep uses this to scope the functional comparison to the turn's own output).
      const kind: BuildOutputKind | undefined = buildOutputKind(parsed!.role);
      expect(kind, `${_id}: buildOutputKind can't classify role ${parsed!.role}`).toBeDefined();
    },
  );
});
