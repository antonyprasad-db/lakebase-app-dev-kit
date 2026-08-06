// Anti-recurrence guard: after the substrate extraction, the SCM/lakebase CLIs
// (scm-claim-feature, scm-prepare-pr, ...) live in the scm-utils package, NOT the
// kit dist. So sftdd orchestrator code must NEVER resolve one via a kit-relative
// `path.join(__dirname, "..", "lakebase", "<x>.cli.js")` (that path exists only
// pre-extraction). It must spawn the bin through the project's `lk` shim, which
// routes to node_modules. Regression: sprint-mode claim hardcoded such a path and
// crashed with MODULE_NOT_FOUND at feature claim. Static scan, hermetic.

import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "..", "..");
// The orchestration layer is now the consort/ function families + the bin/ CLI entrypoints
// (scripts/sftdd/ is gone after the foliation + the CLI move to bin/). Scan both so coverage
// follows the code wherever it lives.
const SCAN_DIRS = [path.join(ROOT, "consort"), path.join(ROOT, "bin")];

// A kit-relative __dirname join that reaches a `lakebase/*.cli.js` file: the
// telltale of resolving a substrate CLI from the (now-nonexistent) kit dist.
const HARDCODED_SUBSTRATE_CLI = /__dirname[\s\S]{0,120}?["']lakebase["'][\s\S]{0,120}?\.cli\.js/;

/** Recursively collect .ts source files (excluding *.test.ts / *.d.ts) under a dir. */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir)) {
    const p = path.join(dir, entry);
    if (fs.statSync(p).isDirectory()) out.push(...sourceFiles(p));
    else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts") && !entry.endsWith(".d.ts")) out.push(p);
  }
  return out;
}

describe("sftdd never hardcodes a kit-relative path to a substrate CLI", () => {
  const files = SCAN_DIRS.flatMap(sourceFiles);

  for (const file of files) {
    const rel = file.slice(ROOT.length + 1);
    it(`${rel} resolves substrate CLIs via lk, not a kit dist path`, () => {
      const src = fs.readFileSync(file, "utf8");
      expect(
        HARDCODED_SUBSTRATE_CLI.test(src),
        `${rel} joins __dirname to a lakebase/*.cli.js path; substrate CLIs must be spawned through the project's lk shim (e.g. lakebase-scm-claim-feature-branch)`,
      ).toBe(false);
    });
  }
});
