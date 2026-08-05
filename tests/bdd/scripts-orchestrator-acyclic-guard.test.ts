// TEMPORARY guard (Stage 0 of the scripts/sftdd foliation): the pile is now ONE-WAY. A
// scripts/sftdd LIBRARY module (not a .cli entrypoint, not a .test) may import from
// consort/orchestrator ONLY:
//   - from a LOW SINK , validators/ (imports only config) or workflow/workflow-vocabulary
//     (zero imports) , which every layer may name downward; OR
//   - as a TYPE-ONLY import (erased at build, no runtime edge); OR
//   - if it is on the small ALLOWLIST of modules that are themselves orchestrator-facing and
//     scheduled to FOLD UP into orchestrator/ in a later stage (next, feature-status), or that
//     sit ABOVE orchestrator as a top consumer (optimize-*), like a bin.
// Any OTHER scripts-lib VALUE edge into orchestrator is a re-introduced cycle , this fails.
//
// This guard is retired by the FINAL foliation stage, replaced by the permanent per-domain
// single-home + acyclic-layering guard.

import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";

/** scripts/sftdd library modules (exclude .cli entrypoints + .test files). */
function scriptLibModules(): string[] {
  return execFileSync("git", ["ls-files", "scripts/sftdd/"], { encoding: "utf-8", cwd: process.cwd() })
    .split("\n")
    .map((l) => l.trim())
    .filter((p) => p.endsWith(".ts") && !p.endsWith(".cli.ts") && !p.endsWith(".test.ts"));
}

// Modules whose VALUE edge into orchestrator is legitimate for now:
//   optimize-* , the champion-walk harness sits ABOVE orchestrator (consumes the drive loop
//     + config); a top consumer like a bin, merged into consort/optimize/ in the final stage.
// (next/revise/feature-status/synthesis have FOLDED UP into consort/orchestrator/status/, so
//  they no longer live in scripts/sftdd and need no allowlist entry , their edges are now
//  orchestrator-internal.)
const ALLOWLIST = new Set<string>([]);
const ALLOWLIST_PREFIXES = ["scripts/sftdd/optimize-"];

/** A low sink under orchestrator/ that any layer may import downward. */
function isLowSink(spec: string): boolean {
  return /consort\/orchestrator\/validators\//.test(spec) || /consort\/orchestrator\/workflow\/workflow-vocabulary/.test(spec);
}

describe("scripts/sftdd → consort/orchestrator is acyclic (temporary Stage-0 guard)", () => {
  it("no scripts-lib module has a NEW value edge into orchestrator (only low sinks + the fold-up allowlist)", () => {
    const offenders: string[] = [];
    for (const file of scriptLibModules()) {
      if (ALLOWLIST.has(file) || ALLOWLIST_PREFIXES.some((p) => file.startsWith(p))) continue;
      // git ls-files can list a path that a mid-foliation `git mv` has already moved off
      // disk but not yet committed; skip anything not present (its new home is scanned there).
      if (!existsSync(file)) continue;
      const src = readFileSync(file, "utf-8");
      for (const line of src.split("\n")) {
        const m = line.match(/^\s*import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/);
        if (!m) continue;
        const [, typeOnly, spec] = m;
        if (!spec.includes("consort/orchestrator")) continue;
        if (typeOnly) continue; // erased at build, no runtime edge
        if (isLowSink(spec)) continue; // downward to a sink
        offenders.push(`${file}: ${line.trim()}`);
      }
    }
    expect(
      offenders,
      `a scripts/sftdd library module imports an orchestrator VALUE (re-introduced cycle). ` +
        `Repoint to a low sink (validators/, workflow-vocabulary), make it type-only, or move the module UP into orchestrator/:\n  ` +
        offenders.join("\n  "),
    ).toEqual([]);
  });
});
