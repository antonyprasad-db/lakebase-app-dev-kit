// Hermetic test for the first-project example seed stager (the `lakebase-stage-first-project`
// bin's core). Copies the REAL bundled seed into a temp project's .consort/ and asserts the
// mapping the drive expects: intake at the .consort root + design/, the brand asset alongside
// the brief, and one feature-request.md per seed feature. No network, no Lakebase.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { stageFirstProject } from "../../bin/lakebase/stage-first-project.cli.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SEED_DIR = path.join(REPO_ROOT, "examples", "first-project", "stockflow-seed");

describe("stageFirstProject (first-project example seed stager)", () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "stage-fp-"));
    // A fresh project already has a .consort/ (create-project bootstraps it); mirror that so
    // resolveConsortDir picks it instead of falling back to a legacy name.
    fs.mkdirSync(path.join(projectDir, ".consort"), { recursive: true });
  });
  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  it("stages intake into .consort/ and the brand asset alongside the brief", () => {
    const r = stageFirstProject({ projectDir, seedDir: SEED_DIR });
    const c = path.join(projectDir, ".consort");
    for (const rel of [
      "product-overview.md",
      "nfrs.md",
      "design/design-brief.md",
      "design/assets/warehouse.png",
    ]) {
      expect(fs.existsSync(path.join(c, rel)), `${rel} should be staged`).toBe(true);
    }
    // The brief references the icon as `assets/warehouse.png` alongside it, so they must be siblings.
    expect(fs.existsSync(path.join(c, "design", "design-brief.md"))).toBe(true);
    expect(fs.existsSync(path.join(c, "design", "assets", "warehouse.png"))).toBe(true);
    expect(r.staged.length).toBeGreaterThanOrEqual(4);
  });

  it("stages one feature-request.md per seed feature, at features/<id>/feature-request.md", () => {
    const r = stageFirstProject({ projectDir, seedDir: SEED_DIR });
    // Every seed feature-request lands under its own feature dir.
    expect(r.features).toContain("F1-stock-visibility");
    expect(r.features).toContain("F6-split-tracking-code");
    for (const f of r.features) {
      const fr = path.join(projectDir, ".consort", "features", f, "feature-request.md");
      expect(fs.existsSync(fr), `${f}/feature-request.md should exist`).toBe(true);
    }
    // Spot-check that content copied verbatim: F6 carries the DROP requirement (the seed fix).
    const f6 = fs.readFileSync(
      path.join(projectDir, ".consort", "features", "F6-split-tracking-code", "feature-request.md"),
      "utf8",
    );
    expect(f6.toLowerCase()).toContain("drop");
    expect(f6).toContain("inventory_code");
  });

  it("does NOT stage feature-proposals (the Spec Author regenerates them in /plan)", () => {
    stageFirstProject({ projectDir, seedDir: SEED_DIR });
    expect(fs.existsSync(path.join(projectDir, ".consort", "planning", "feature-proposals.md"))).toBe(false);
  });

  it("throws a clear error when the bundled seed is missing (packaging fault)", () => {
    expect(() => stageFirstProject({ projectDir, seedDir: path.join(projectDir, "nope") })).toThrow(
      /seed not found/,
    );
  });

  it("is idempotent (re-staging overwrites without error)", () => {
    stageFirstProject({ projectDir, seedDir: SEED_DIR });
    expect(() => stageFirstProject({ projectDir, seedDir: SEED_DIR })).not.toThrow();
  });
});
