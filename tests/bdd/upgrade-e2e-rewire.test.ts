// A kit upgrade RESETS scripts/run-tests.sh to the template, which carries no Playwright block
// (the block is appended per-project). So refreshSurface must RE-APPEND the E2E block for a UI
// project , otherwise every upgrade wipes E2E out of the deploy-verify gate (how F4's actor-less
// form shipped past a green verify), and a pre-enable-e2e project never had it. Backend projects
// are untouched.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { refreshSurface } from "../../consort/lakebase/upgrade";
import { writeConsortConfig, defaultConsortConfig } from "../../consort/config/consort-config-file";

const KIT_ROOT = resolve(__dirname, "..", "..");

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "e2e-rewire-")); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function runTests(): string {
  const p = join(dir, "scripts", "run-tests.sh");
  return existsSync(p) ? readFileSync(p, "utf8") : "";
}

describe("refreshSurface re-wires the E2E block for a UI project (upgrade must not wipe it)", () => {
  it("a UI (react) project gets the Playwright block re-appended to run-tests.sh", () => {
    const cfg = defaultConsortConfig();
    cfg.project!.uiTrack = true;
    cfg.project!.clientFramework = "react";
    writeConsortConfig(dir, cfg);
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "app", scripts: {}, devDependencies: {} }));
    mkdirSync(join(dir, "client"), { recursive: true });
    writeFileSync(join(dir, "client", "package.json"), JSON.stringify({ name: "client", scripts: {}, devDependencies: {} }));

    const r = refreshSurface(dir, KIT_ROOT, "v0.3.52-test");
    expect(r.e2e).toBe(true);
    // The template run-tests.sh has NO Playwright block; after the re-wire it does.
    expect(runTests()).toMatch(/playwright test/);
  });

  it("a backend-only project is left untouched (no E2E block, e2e=false)", () => {
    const cfg = defaultConsortConfig();
    cfg.project!.uiTrack = false;
    cfg.project!.clientFramework = "none";
    writeConsortConfig(dir, cfg);
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "api", scripts: {}, devDependencies: {} }));

    const r = refreshSurface(dir, KIT_ROOT, "v0.3.52-test");
    expect(r.e2e).toBe(false);
    expect(runTests()).not.toMatch(/playwright test/);
  });
});
