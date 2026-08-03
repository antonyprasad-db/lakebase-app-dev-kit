// lifecycle-catalogue: run-scoped setup/teardown ops selected by kind. This pins the
// catalogue's resolution + the no-cloud remove-project path (deleting a local dir). The
// cloud calls (scaffold-project -> createProject; remove-project -> deleteLakebaseProject)
// are exercised only in a gated live run , here we assert the catalogue shape + the local
// filesystem half of teardown.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  LIFECYCLE_CATALOGUE,
  resolveLifecycleKind,
  catalogueLifecycleDeps,
} from "../../consort/orchestrator/manifest/lifecycle-catalogue";

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "lifecycle-cat-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("lifecycle-catalogue", () => {
  it("catalogues scaffold-project + remove-project, each with a description + config summary", () => {
    expect(Object.keys(LIFECYCLE_CATALOGUE).sort()).toEqual(["remove-project", "scaffold-project"]);
    for (const k of Object.keys(LIFECYCLE_CATALOGUE)) {
      expect(LIFECYCLE_CATALOGUE[k].description.length).toBeGreaterThan(0);
      expect(typeof LIFECYCLE_CATALOGUE[k].run).toBe("function");
    }
  });

  it("resolveLifecycleKind THROWS loud on an unknown kind", () => {
    expect(() => resolveLifecycleKind("noSuchOp")).toThrow(/noSuchOp|unknown/i);
  });

  it("scaffold-project fails cleanly (ok:false) when required config is missing , no throw", async () => {
    const r = await catalogueLifecycleDeps.run({ kind: "scaffold-project", config: {} }, { workspaceDir: root });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/projectName|databricksHost/i);
  });

  it("remove-project deletes the local project dir from the setup handle (no-cloud path)", async () => {
    const projectDir = join(root, "proj");
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(join(projectDir, "marker.txt"), "x");
    // No lakebaseProjectId/host => teardown skips the cloud delete + just removes the dir.
    const r = await catalogueLifecycleDeps.run(
      { kind: "remove-project", config: {} },
      { workspaceDir: root, setupHandle: { projectDir } },
    );
    expect(r.ok).toBe(true);
    expect(existsSync(projectDir)).toBe(false);
  });

  it("remove-project reports (does not throw) when there is no setup handle", async () => {
    const r = await catalogueLifecycleDeps.run({ kind: "remove-project", config: {} }, { workspaceDir: root });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/handle|nothing/i);
  });
});
