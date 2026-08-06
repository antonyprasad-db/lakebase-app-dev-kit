// Hermetic test for the orphan sweep (consort/setup/orphan-project-sweep): find leaked scaffolded
// test-project dirs under a parent, delete their Lakebase project via an INJECTED spy (no cloud),
// remove the local dir. Proves: only prefix-matched dirs WITH scaffold metadata are swept; a
// non-scaffold dir + a non-matching-prefix dir are left alone; the dir is removed only after a
// successful delete; a delete failure leaves the dir (so a later sweep retries).

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  findOrphanProjects,
  readScaffoldProjectMeta,
  sweepOrphanProjects,
  type DeleteLakebaseProjectFn,
} from "../../consort/setup/orphan-project-sweep";

let parent: string;

/** Write a scaffolded-project-shaped dir: .env (LAKEBASE_PROJECT_ID + DATABRICKS_HOST) + .lakebase/
 *  workflow-state.json (project_id). Omit a marker to simulate a non-scaffold dir. */
function makeScaffoldDir(name: string, opts: { projectId?: string; host?: string; lakebase?: boolean; wsProjectId?: string | null } = {}): string {
  const dir = join(parent, name);
  mkdirSync(dir, { recursive: true });
  const projectId = opts.projectId ?? name;
  const host = opts.host ?? "https://ws.example.com";
  if (opts.projectId !== null) {
    writeFileSync(join(dir, ".env"), `LAKEBASE_PROJECT_ID=${projectId}\nDATABRICKS_HOST=${host}\n`);
  }
  if (opts.lakebase !== false) {
    mkdirSync(join(dir, ".lakebase"), { recursive: true });
    const wsId = opts.wsProjectId === undefined ? projectId : opts.wsProjectId;
    if (wsId !== null) writeFileSync(join(dir, ".lakebase", "workflow-state.json"), JSON.stringify({ project_id: wsId }));
  }
  return dir;
}

beforeEach(() => {
  parent = mkdtempSync(join(tmpdir(), "orphan-sweep-"));
});
afterEach(() => {
  rmSync(parent, { recursive: true, force: true });
});

describe("readScaffoldProjectMeta", () => {
  it("reads projectId + host from a scaffolded dir's .env", () => {
    const dir = makeScaffoldDir("de-live-1", { projectId: "de-live-1", host: "https://h.example.com" });
    expect(readScaffoldProjectMeta(dir)).toEqual({ projectId: "de-live-1", host: "https://h.example.com" });
  });
  it("returns null when the .lakebase marker is absent (not a scaffold dir)", () => {
    const dir = makeScaffoldDir("de-live-2", { lakebase: false });
    expect(readScaffoldProjectMeta(dir)).toBeNull();
  });
  it("returns null when .env lacks LAKEBASE_PROJECT_ID", () => {
    const dir = join(parent, "de-live-3");
    mkdirSync(join(dir, ".lakebase"), { recursive: true });
    writeFileSync(join(dir, ".env"), "DATABRICKS_HOST=https://h.example.com\n");
    expect(readScaffoldProjectMeta(dir)).toBeNull();
  });
  it("returns null when workflow-state project_id contradicts the .env id", () => {
    const dir = makeScaffoldDir("de-live-4", { projectId: "de-live-4", wsProjectId: "something-else" });
    expect(readScaffoldProjectMeta(dir)).toBeNull();
  });
});

describe("findOrphanProjects: prefix + metadata bounded", () => {
  it("finds only prefix-matched dirs that carry scaffold metadata", () => {
    makeScaffoldDir("de-live-a");
    makeScaffoldDir("dg-live-b");
    makeScaffoldDir("de-live-nometa", { lakebase: false }); // prefix match but not a scaffold => skip
    mkdirSync(join(parent, "my-real-project", ".lakebase"), { recursive: true }); // metadata but wrong prefix => skip
    writeFileSync(join(parent, "my-real-project", ".env"), "LAKEBASE_PROJECT_ID=real\nDATABRICKS_HOST=https://h\n");

    const found = findOrphanProjects(parent).map((o) => o.projectId).sort();
    expect(found).toEqual(["de-live-a", "dg-live-b"]);
  });
  it("honors a custom prefix list", () => {
    makeScaffoldDir("de-live-x");
    makeScaffoldDir("custom-y");
    const found = findOrphanProjects(parent, ["custom-"]).map((o) => o.projectId);
    expect(found).toEqual(["custom-y"]);
  });
  it("is a no-op on a missing parent", () => {
    expect(findOrphanProjects(join(parent, "nope"))).toEqual([]);
  });
});

describe("sweepOrphanProjects: delete-then-remove, best-effort", () => {
  it("deletes each orphan's Lakebase project + removes its dir", async () => {
    const a = makeScaffoldDir("de-live-a", { projectId: "de-live-a", host: "https://h1" });
    const b = makeScaffoldDir("dg-live-b", { projectId: "dg-live-b", host: "https://h2" });
    const deleted: Array<{ projectId: string; host: string }> = [];
    const del: DeleteLakebaseProjectFn = async (args) => { deleted.push(args); };

    const report = await sweepOrphanProjects({ parentDir: parent, deleteLakebaseProject: del });

    expect(deleted).toEqual([
      { projectId: "de-live-a", host: "https://h1" },
      { projectId: "dg-live-b", host: "https://h2" },
    ]);
    expect(report.every((r) => r.deleted && r.dirRemoved)).toBe(true);
    expect(existsSync(a)).toBe(false);
    expect(existsSync(b)).toBe(false);
  });

  it("LEAVES the dir when the Lakebase delete throws (so a later sweep retries)", async () => {
    const dir = makeScaffoldDir("de-live-fail", { projectId: "de-live-fail" });
    const del: DeleteLakebaseProjectFn = async () => { throw new Error("cloud 503"); };

    const report = await sweepOrphanProjects({ parentDir: parent, deleteLakebaseProject: del });

    expect(report[0].deleted).toBe(false);
    expect(report[0].dirRemoved).toBe(false);
    expect(report[0].error).toMatch(/cloud 503/);
    expect(existsSync(dir), "dir stays so the next sweep retries the delete").toBe(true);
  });

  it("one orphan's failure does not stop the rest", async () => {
    makeScaffoldDir("de-live-ok", { projectId: "de-live-ok" });
    makeScaffoldDir("de-live-bad", { projectId: "de-live-bad" });
    const del: DeleteLakebaseProjectFn = async ({ projectId }) => {
      if (projectId === "de-live-bad") throw new Error("boom");
    };
    const report = await sweepOrphanProjects({ parentDir: parent, deleteLakebaseProject: del });
    const byId = Object.fromEntries(report.map((r) => [r.projectId, r]));
    expect(byId["de-live-ok"].deleted).toBe(true);
    expect(byId["de-live-bad"].deleted).toBe(false);
  });

  it("is a no-op report when nothing is orphaned", async () => {
    let called = false;
    const del: DeleteLakebaseProjectFn = async () => { called = true; };
    const report = await sweepOrphanProjects({ parentDir: parent, deleteLakebaseProject: del });
    expect(report).toEqual([]);
    expect(called).toBe(false);
  });
});
