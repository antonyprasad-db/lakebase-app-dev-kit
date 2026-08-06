// Auto-apply: the unattended champion walk bakes a winning candidate's CONFIG levers
// into the kit as DATA (optimized-defaults.json), which defaultConsortConfig deep-merges.
// No TS source rewrite (single-source rule holds); a rebuild inlines the overlay. These
// tests cover the writer (applyWinnerToOverlay) against a temp kit tree, and the merge
// semantics via a direct merge check , NOT against the live kit's committed overlay
// (that is exercised by sftdd-config.test.ts + the live run).

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { applyWinnerToOverlay } from "../../consort/optimize/optimize-apply";
import type { Candidate } from "../../consort/optimize/optimize-candidates";

let kitDir: string;
let overlayPath: string;

beforeEach(() => {
  kitDir = mkdtempSync(join(tmpdir(), "auto-apply-kit-"));
  mkdirSync(join(kitDir, "consort", "config"), { recursive: true });
  overlayPath = join(kitDir, "consort", "config", "optimized-defaults.json");
  writeFileSync(overlayPath, JSON.stringify({ _comment: "seed", roles: {} }) + "\n");
});
afterEach(() => rmSync(kitDir, { recursive: true, force: true }));

const readOverlay = () => JSON.parse(readFileSync(overlayPath, "utf8"));

describe("applyWinnerToOverlay: bake a config winner into the data overlay", () => {
  it("writes a per-turn model+effort winner (build turn) into roles.<role>", () => {
    const winner: Candidate = {
      id: "driver-refactor-m-haiku-e-low",
      configOverrides: { roles: { driver: { model: { refactor: "haiku" }, effort: { refactor: "low" } } } },
    };
    const changed = applyWinnerToOverlay(kitDir, winner);
    expect(changed).toBe(true);
    const o = readOverlay();
    expect(o.roles.driver.model.refactor).toBe("haiku");
    expect(o.roles.driver.effort.refactor).toBe("low");
  });

  it("writes a scalar design winner (ux-designer model) into the overlay", () => {
    const winner: Candidate = { id: "ux-designer-m-opus", configOverrides: { roles: { "ux-designer": { model: "opus" } } } };
    expect(applyWinnerToOverlay(kitDir, winner)).toBe(true);
    expect(readOverlay().roles["ux-designer"].model).toBe("opus");
  });

  it("MERGES element-wise , a new turn key does not clobber an existing one for the same role", () => {
    applyWinnerToOverlay(kitDir, { id: "a", configOverrides: { roles: { driver: { model: { refactor: "haiku" } } } } });
    applyWinnerToOverlay(kitDir, { id: "b", configOverrides: { roles: { driver: { model: { review: "sonnet" } } } } });
    const o = readOverlay();
    // both turn winners coexist under driver.model
    expect(o.roles.driver.model.refactor).toBe("haiku");
    expect(o.roles.driver.model.review).toBe("sonnet");
  });

  it("is a NO-OP for a baseline (no config overrides) winner", () => {
    const before = readFileSync(overlayPath, "utf8");
    expect(applyWinnerToOverlay(kitDir, { id: "baseline", configOverrides: {} })).toBe(false);
    expect(readFileSync(overlayPath, "utf8")).toBe(before); // untouched
  });

  it("is IDEMPOTENT , re-applying the same winner does not rewrite the file", () => {
    const winner: Candidate = { id: "w", configOverrides: { roles: { dba: { effort: "low" } } } };
    expect(applyWinnerToOverlay(kitDir, winner)).toBe(true);
    const after1 = readFileSync(overlayPath, "utf8");
    expect(applyWinnerToOverlay(kitDir, winner)).toBe(false); // no change
    expect(readFileSync(overlayPath, "utf8")).toBe(after1);
  });

  it("creates the overlay when absent (fresh kit)", () => {
    rmSync(overlayPath);
    expect(existsSync(overlayPath)).toBe(false);
    expect(applyWinnerToOverlay(kitDir, { id: "w", configOverrides: { roles: { navigator: { effort: { review: "low" } } } } })).toBe(true);
    expect(readOverlay().roles.navigator.effort.review).toBe("low");
  });

  it("does NOT persist content-only levers (those are agent-.md, applied separately)", () => {
    const before = readFileSync(overlayPath, "utf8");
    const winner: Candidate = { id: "scan", configOverrides: {}, content: { disallowedTools: ["Grep", "Glob"], taskSuffix: "be terse" } };
    expect(applyWinnerToOverlay(kitDir, winner)).toBe(false); // no config override -> overlay untouched
    expect(readFileSync(overlayPath, "utf8")).toBe(before);
  });
});

describe("defaultConsortConfig reflects the committed overlay (spec-author breakdown winner)", () => {
  it("the live kit overlay applies spec-author breakdown haiku+low via deep-merge", async () => {
    // The committed optimized-defaults.json carries the spec-author breakdown winner;
    // defaultConsortConfig deep-merges it. This asserts the wiring end-to-end on the real
    // kit config (not a temp tree), proving the overlay path is load-bearing.
    const { defaultConsortConfig } = await import("../../consort/orchestrator/settings/project-settings");
    const cfg = defaultConsortConfig();
    const sa = cfg.roles?.["spec-author"];
    const model = sa?.model as Record<string, string> | string | undefined;
    const effort = sa?.effort as Record<string, string> | string | undefined;
    expect(typeof model === "object" ? model.breakdown : undefined).toBe("haiku");
    expect(typeof effort === "object" ? effort.breakdown : undefined).toBe("low");
  });
});
