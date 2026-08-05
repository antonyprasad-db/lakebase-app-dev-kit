// PERMANENT anti-recurrence guard for the scripts/sftdd foliation: the flat scripts/sftdd/ pile
// was foliated into first-class consort/<domain>/ families (config, logging, gates, experiment,
// pipeline, smells, architecture, intake, deploy, optimize, session, reports, test-list, setup)
// plus the orchestrator/ families, and the dependency graph is now ONE-WAY:
//
//   consort/<family>/ libraries  ->  each other, DOWNWARD by layer  ->  scripts/sftdd/*.cli bins
//
// The bins COMPOSE the families (that is what an entrypoint does); a family library must NEVER
// reach back UP into a bin (or into any other scripts/sftdd/ module), because scripts/sftdd/ now
// holds ONLY .cli entrypoints, .test files, schemas, and docs , no library a family could depend on.
//
// Two invariants:
//   1. scripts/sftdd/ contains NO library module (the pile is fully foliated). A new lib file there
//      means someone added domain code to the old flat home instead of a consort/<family>/.
//   2. No consort/ library imports a VALUE from scripts/sftdd/, except the ONE documented exception
//      (optimize-live -> optimize.cli: a pre-existing lib->bin coupling for isBuildHandoff /
//      actionToHandoffPlan; tracked here so a NEW back-web edge still fails).
//
// This retires the temporary Stage-0 guard (scripts-orchestrator-acyclic-guard) , the graph is now
// enforced from the consort/ side, which is where domain code lives.

import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

/** git ls-files under a dir (tracked paths). */
function tracked(dir: string): string[] {
  return execFileSync("git", ["ls-files", dir], { encoding: "utf-8", cwd: process.cwd() })
    .split("\n").map((l) => l.trim()).filter(Boolean);
}

/** Recursively list files under a dir ON DISK (catches an untracked new file too, so the guard
 *  bites before the file is even staged). Repo-relative paths. */
function onDisk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...onDisk(p));
    else out.push(p);
  }
  return out;
}

// The single allowed consort -> scripts/sftdd value edge (documented lib->bin coupling).
const ALLOWED_BACKWEB = new Set<string>([
  "consort/optimize/optimize-live.ts", // -> scripts/sftdd/optimize.cli.js (isBuildHandoff, actionToHandoffPlan)
]);

describe("consort foliation: scripts/sftdd holds only bins, and no family reaches back up into it", () => {
  it("scripts/sftdd/ contains NO library module (the pile is fully foliated)", () => {
    const libs = onDisk("scripts/sftdd").filter(
      (p) => p.endsWith(".ts") && !p.endsWith(".cli.ts") && !p.endsWith(".test.ts") && !p.includes("/schemas/"),
    );
    expect(
      libs,
      `scripts/sftdd/ should hold only .cli bins + tests + schemas after foliation; these library ` +
        `modules resurfaced , put domain code in a consort/<family>/ instead:\n  ${libs.join("\n  ")}`,
    ).toEqual([]);
  });

  it("no consort/ library imports a VALUE from scripts/sftdd/ (bins compose families, never the reverse)", () => {
    const offenders: string[] = [];
    for (const file of tracked("consort/")) {
      if (!file.endsWith(".ts") || file.endsWith(".test.ts")) continue;
      if (file.includes("/evaluation/fixtures/")) continue; // recorded corpus, not kit source
      if (ALLOWED_BACKWEB.has(file)) continue;
      const src = readFileSync(file, "utf-8");
      for (const line of src.split("\n")) {
        const m = line.match(/^\s*import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/);
        if (!m) continue;
        const [, typeOnly, spec] = m;
        if (typeOnly) continue; // erased at build, no runtime edge
        if (/scripts\/sftdd\//.test(spec)) offenders.push(`${file}: ${line.trim()}`);
      }
    }
    expect(
      offenders,
      `a consort/ family library imports a VALUE from scripts/sftdd/ (a re-introduced UP edge into ` +
        `the bin layer). Move the needed code DOWN into a consort/<family>/, make the import type-only, ` +
        `or (if a genuine lib->bin coupling) add it to ALLOWED_BACKWEB with a note:\n  ${offenders.join("\n  ")}`,
    ).toEqual([]);
  });
});
