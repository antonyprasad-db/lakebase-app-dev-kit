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
  removeProject,
  type RemoveProjectEffects,
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

  // The leak that failed the live demo three times: remove-project only deleted the Lakebase
  // project + local dir, never the self-hosted RUNNER or the GitHub REPO the scaffold created.
  // Port the proven never-leaking teardown from create-project.test.ts + scm-utils:
  //   stopRunner -> removeRunner -> deleteGithubRepo -> deleteLakebaseProject -> rmSync,
  // driven off the enriched scaffold handle. Effects are injected so the order is pinned
  // hermetically (no cloud).
  it("remove-project tears down runner + repo + Lakebase + dir, in order, from the enriched handle", async () => {
    const projectDir = join(root, "proj");
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(join(projectDir, "marker.txt"), "x");
    const calls: string[] = [];
    const effects: RemoveProjectEffects = {
      stopRunner: (name) => { calls.push(`stopRunner:${name}`); },
      removeRunner: async (a) => { calls.push(`removeRunner:${a.fullRepoName}:${a.projectName}`); },
      deleteGithubRepo: (repo) => { calls.push(`deleteGithubRepo:${repo}`); },
      deleteLakebaseProject: async (a) => { calls.push(`deleteLakebaseProject:${a.projectId}:${a.host}`); },
    };
    const r = await removeProject(
      {},
      {
        workspaceDir: root,
        setupHandle: {
          projectDir,
          projectName: "stockflow-demo-x",
          lakebaseProjectId: "stockflow-demo-x",
          databricksHost: "host-x",
          githubRepoFullName: "kevin-hartman/stockflow-demo-x",
          runnerRegistered: true,
        },
      },
      effects,
    );
    expect(r.ok, r.error).toBe(true);
    // runner de-registration BEFORE the repo is deleted (the GH API needs the repo alive),
    // repo delete BEFORE Lakebase, then the dir.
    expect(calls).toEqual([
      "stopRunner:stockflow-demo-x",
      "removeRunner:kevin-hartman/stockflow-demo-x:stockflow-demo-x",
      "deleteGithubRepo:kevin-hartman/stockflow-demo-x",
      "deleteLakebaseProject:stockflow-demo-x:host-x",
    ]);
    expect(existsSync(projectDir)).toBe(false);
  });

  it("remove-project skips the runner steps when the scaffold registered no runner", async () => {
    const projectDir = join(root, "proj2");
    mkdirSync(projectDir, { recursive: true });
    const calls: string[] = [];
    const effects: RemoveProjectEffects = {
      stopRunner: (name) => { calls.push(`stopRunner:${name}`); },
      removeRunner: async (a) => { calls.push(`removeRunner:${a.projectName}`); },
      deleteGithubRepo: (repo) => { calls.push(`deleteGithubRepo:${repo}`); },
      deleteLakebaseProject: async (a) => { calls.push(`deleteLakebaseProject:${a.projectId}`); },
    };
    const r = await removeProject(
      {},
      { workspaceDir: root, setupHandle: { projectDir, githubRepoFullName: "kevin-hartman/x", lakebaseProjectId: "x", databricksHost: "h", runnerRegistered: false } },
      effects,
    );
    expect(r.ok, r.error).toBe(true);
    expect(calls).toEqual(["deleteGithubRepo:kevin-hartman/x", "deleteLakebaseProject:x"]);
  });

  it("remove-project is best-effort: one failing step does not abort the rest, but ok:false reports it", async () => {
    const projectDir = join(root, "proj3");
    mkdirSync(projectDir, { recursive: true });
    const calls: string[] = [];
    const effects: RemoveProjectEffects = {
      stopRunner: () => {},
      removeRunner: async () => {},
      deleteGithubRepo: () => { throw new Error("repo boom"); },
      deleteLakebaseProject: async (a) => { calls.push(`deleteLakebaseProject:${a.projectId}`); },
    };
    const r = await removeProject(
      {},
      { workspaceDir: root, setupHandle: { projectDir, projectName: "y", githubRepoFullName: "o/y", lakebaseProjectId: "y", databricksHost: "h", runnerRegistered: true } },
      effects,
    );
    // the repo delete failed, but Lakebase delete + dir removal STILL happened.
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/repo boom/);
    expect(calls).toEqual(["deleteLakebaseProject:y"]);
    expect(existsSync(projectDir)).toBe(false);
  });
});
