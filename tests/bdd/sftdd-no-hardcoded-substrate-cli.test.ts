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
const SFTDD_DIR = path.resolve(here, "..", "..", "scripts", "sftdd");

// A kit-relative __dirname join that reaches a `lakebase/*.cli.js` file: the
// telltale of resolving a substrate CLI from the (now-nonexistent) kit dist.
const HARDCODED_SUBSTRATE_CLI = /__dirname[\s\S]{0,120}?["']lakebase["'][\s\S]{0,120}?\.cli\.js/;

describe("sftdd never hardcodes a kit-relative path to a substrate CLI", () => {
  const files = fs
    .readdirSync(SFTDD_DIR)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));

  for (const file of files) {
    it(`${file} resolves substrate CLIs via lk, not a kit dist path`, () => {
      const src = fs.readFileSync(path.join(SFTDD_DIR, file), "utf8");
      expect(
        HARDCODED_SUBSTRATE_CLI.test(src),
        `${file} joins __dirname to a lakebase/*.cli.js path; substrate CLIs must be spawned through the project's lk shim (e.g. lakebase-scm-claim-feature-branch)`,
      ).toBe(false);
    });
  }
});
