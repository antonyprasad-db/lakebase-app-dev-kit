// Release-artifact guard: every bin in package.json must be SHIPPED, i.e. its
// dist/ target must be git-tracked. dist/ is .gitignore'd but the kit ships a
// pre-built dist on every tag (force-added despite the ignore) because a consumer
// install (npm install github:...#ref) skips the build , see scripts/prepare.mjs.
//
// The defect this guards: when a new bin family landed (the sftdd/tdd CLIs), its
// built output was gitignored and never force-added, so the shipped dist omitted
// dist/scripts/sftdd/** entirely. `npm run build` produced the files locally, so
// nothing on disk looked wrong, but a real consumer install was missing 48 of 75
// bins , every /plan, /design, /build, /deploy backend. A disk-existence check
// would NOT have caught it (the dev clone builds them); only a git-tracked check
// does. So this test asks git, not the filesystem.

import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(__dirname, "..", "..");

/** The set of dist/ files git actually tracks (what a tag ships). */
function trackedDistFiles(): Set<string> {
  const out = execFileSync("git", ["ls-files", "dist"], { cwd: REPO_ROOT, encoding: "utf8" });
  return new Set(out.split("\n").map((l) => l.trim()).filter(Boolean));
}

describe("shipped release artifact: every package.json bin is git-tracked in dist/", () => {
  it("no bin target is missing from the shipped (git-tracked) dist", () => {
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")) as {
      bin: Record<string, string>;
    };
    const tracked = trackedDistFiles();
    const bins = Object.entries(pkg.bin);
    expect(bins.length).toBeGreaterThan(0);

    // The kit now declares ONLY its own bins (all under ./dist/...). Substrate/SCM
    // bins live in @databricks-solutions/lakebase-scm-utils and are resolved by lk
    // (and the driver) from that package's own dist, so they are validated there,
    // never redeclared here. Normalize the bin path
    // ("./dist/scripts/sftdd/intake.cli.js") to the repo-relative form git ls-files
    // emits ("dist/scripts/sftdd/intake.cli.js").
    const missing = bins
      .map(([name, p]) => [name, p.replace(/^\.\//, "")] as const)
      .filter(([, p]) => !tracked.has(p));

    expect(
      missing,
      `these bins are declared in package.json but their dist target is NOT git-tracked, ` +
        `so a consumer install (which skips the build) ships them broken. Rebuild + ` +
        `\`git add -f\` the dist targets:\n` +
        missing.map(([n, p]) => `  ${n} -> ${p}`).join("\n"),
    ).toEqual([]);
  });
});

// Same failure class as the bins, one layer down: the step MANIFESTS are runtime
// DATA (not TS, not *.schema.json), read at runtime by step-manifest.ts relative to
// its compiled location. copy-build-assets.mjs copies them into dist/ and the tag
// force-adds the built dist, so a consumer install (which never rebuilds) must find
// every manifest already git-tracked in dist/. A disk check would pass in the dev
// clone; only asking git catches a manifest that was authored but never shipped.
describe("shipped release artifact: every step manifest is git-tracked in dist/", () => {
  it("no scripts/sftdd/step-manifests/*.json is missing from the shipped (git-tracked) dist", () => {
    const srcDir = join(REPO_ROOT, "scripts", "sftdd", "step-manifests");
    const manifests = readdirSync(srcDir).filter((f) => f.endsWith(".json")).sort();
    expect(manifests.length).toBeGreaterThan(0);

    const tracked = trackedDistFiles();
    const missing = manifests
      .map((f) => `dist/scripts/sftdd/step-manifests/${f}`)
      .filter((p) => !tracked.has(p));

    expect(
      missing,
      `these step manifests exist in source but their dist twin is NOT git-tracked, so a ` +
        `consumer install (which skips the build) will ENOENT loading them. Run ` +
        `\`npm run build\` then \`git add -f dist/scripts/sftdd/step-manifests\`:\n` +
        missing.map((p) => `  ${p}`).join("\n"),
    ).toEqual([]);
  });
});
