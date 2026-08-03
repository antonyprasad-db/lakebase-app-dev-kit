// lifecycle-catalogue: the catalogue of RUN-SCOPED lifecycle ops a run-config's setup/teardown
// select by kind (mirrors the agent catalogue). A run-config declares
// `setup: { kind, config }` / `teardown: { kind, config }`; the runner's LifecycleDeps
// dispatches the kind through this catalogue.
//
// Kinds:
//   scaffold-project : create a REAL project via the kit createProject (Databricks + GitHub +
//                      Lakebase). Cloud-bound , needs creds; returns a handle (projectDir,
//                      lakebaseProjectId, repo url) teardown consumes.
//   remove-project   : delete what scaffold-project created (Lakebase project + local dir; the
//                      GitHub repo is left unless config.deleteRepo). Reads the setup handle.
//
// resolveLifecycleKind throws loud on an unknown kind. The builders are pure (no cloud at
// import); the cloud calls happen only when a run actually invokes them (a gated live run).

import { rmSync } from "node:fs";
import { createProject } from "../../../scripts/lakebase/create-project.js";
import type { LifecycleOp, LifecycleResult, LifecycleRunContext, LifecycleDeps } from "./orchestration-runner.js";

/** One catalogue entry: a description + the executor for that op kind. */
export interface LifecycleCatalogueEntry {
  description: string;
  configSummary: string;
  run(config: Record<string, unknown>, context: LifecycleRunContext): Promise<LifecycleResult>;
}

/** scaffold-project: real createProject into context.workspaceDir's parent, returning a
 *  teardown handle. Config carries the createProject inputs the caller must supply (project
 *  name, Databricks host, github owner, tiers, uiTrack, ...). Cloud-bound. */
async function scaffoldProject(config: Record<string, unknown>, context: LifecycleRunContext): Promise<LifecycleResult> {
  const c = config as {
    projectName?: string;
    parentDir?: string;
    databricksHost?: string;
    githubOwner?: string;
    createGithubRepo?: boolean;
    tiers?: 1 | 2 | 3;
    uiTrack?: boolean;
    language?: "java" | "kotlin" | "python" | "nodejs";
  };
  if (!c.projectName) return { ok: false, error: "scaffold-project requires config.projectName" };
  if (!c.databricksHost) return { ok: false, error: "scaffold-project requires config.databricksHost" };
  const parentDir = c.parentDir ?? context.workspaceDir;
  try {
    const res = await createProject({
      projectName: c.projectName,
      parentDir,
      databricksHost: c.databricksHost,
      githubOwner: c.githubOwner,
      createGithubRepo: c.createGithubRepo,
      tiers: c.tiers,
      uiTrack: c.uiTrack,
      language: c.language,
    });
    return {
      ok: true,
      handle: {
        projectDir: res.projectDir,
        lakebaseProjectId: res.lakebaseProjectId,
        githubRepoUrl: res.githubRepoUrl ?? null,
        databricksHost: c.databricksHost,
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** remove-project: tear down what scaffold-project created , delete the Lakebase project and
 *  remove the local project dir. Reads the setup handle from the run context. Best-effort:
 *  reports ok:false with the error but never throws (teardown must not mask a chain error). */
async function removeProject(config: Record<string, unknown>, context: LifecycleRunContext): Promise<LifecycleResult> {
  const handle = context.setupHandle as { projectDir?: string; lakebaseProjectId?: string; databricksHost?: string } | undefined;
  if (!handle) return { ok: false, error: "remove-project: no setup handle (nothing to tear down)" };
  const errors: string[] = [];
  // Delete the Lakebase project (best-effort). Imported lazily so the hermetic tests + the
  // no-cloud paths never pull the cloud client at module load.
  if (handle.lakebaseProjectId && handle.databricksHost) {
    try {
      const { deleteLakebaseProject } = await import("@databricks-solutions/lakebase-scm-utils/lakebase");
      await deleteLakebaseProject({ projectId: handle.lakebaseProjectId, databricksHost: handle.databricksHost } as never);
    } catch (e) {
      errors.push(`Lakebase delete: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  // Remove the local project dir.
  if (handle.projectDir) {
    try {
      rmSync(handle.projectDir, { recursive: true, force: true });
    } catch (e) {
      errors.push(`dir remove: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  void config;
  return errors.length ? { ok: false, error: errors.join("; ") } : { ok: true };
}

/** The lifecycle catalogue: kind -> entry. */
export const LIFECYCLE_CATALOGUE: Record<string, LifecycleCatalogueEntry> = {
  "scaffold-project": {
    description: "Create a REAL project via the kit createProject (Databricks + GitHub + Lakebase). Cloud-bound; returns a teardown handle.",
    configSummary: "{ projectName (required), databricksHost (required), parentDir?, githubOwner?, createGithubRepo?, tiers?, uiTrack?, language? }",
    run: scaffoldProject,
  },
  "remove-project": {
    description: "Delete what scaffold-project created (Lakebase project + local dir), reading the setup handle. Best-effort.",
    configSummary: "{ } (consumes the scaffold-project handle from the run context)",
    run: removeProject,
  },
};

/** Resolve a lifecycle kind to its catalogue entry. THROWS loud on an unknown kind. */
export function resolveLifecycleKind(kind: string): LifecycleCatalogueEntry {
  const entry = LIFECYCLE_CATALOGUE[kind];
  if (!entry) {
    const known = Object.keys(LIFECYCLE_CATALOGUE).sort().join(", ");
    throw new Error(`lifecycle-catalogue: unknown lifecycle kind "${kind}". Known: ${known}.`);
  }
  return entry;
}

/** The real LifecycleDeps that dispatch through the catalogue , pass this to runOrchestration
 *  for a live run (tests inject a mock instead). */
export const catalogueLifecycleDeps: LifecycleDeps = {
  run: (op: LifecycleOp, context: LifecycleRunContext) => resolveLifecycleKind(op.kind).run(op.config ?? {}, context),
};
