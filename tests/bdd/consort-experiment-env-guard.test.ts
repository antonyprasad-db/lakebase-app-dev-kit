// The experiment cut is PAIRED: it MUST leave the experiment branch's .env
// populated with that branch's DATABASE_URL, because the build's honest-GREEN
// verify (alembic upgrade head + pytest) runs against that database. The cut
// delegates the .env sync to createPairedBranch, whose sync is best-effort (it
// collects warnings instead of throwing). These tests pin the guard cutExperiment
// adds on top: when the sync was skipped (envSynced=false) – e.g. an endpoint
// provisioning race – the cut must FAIL immediately with the underlying warnings,
// not proceed with an empty .env and surface ~10 turns later at verify time.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, existsSync, writeFileSync } from "fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "os";
import { join } from "path";

const createPairedBranch = vi.fn();
const deletePairedBranch = vi.fn();

vi.mock("@databricks-solutions/lakebase-scm-utils/lakebase", () => ({
  createPairedBranch: (...args: unknown[]) => createPairedBranch(...args),
  deletePairedBranch: (...args: unknown[]) => deletePairedBranch(...args),
}));

import { cutExperiment, experimentDir } from "../../consort/experiment/experiment";

let tdd: string;
let proj: string;

const pairedResult = (over: Record<string, unknown>) => ({
  branch: { name: "projects/inst/branches/exp1", state: "READY" },
  gitBranch: "exp1",
  gitBranchCreated: true,
  envSynced: true,
  warnings: [],
  ...over,
});

const cutArgs = () => ({
  instance: "inst",
  consortDir: tdd,
  projectDir: proj,
  featureId: "F1",
  storyId: "S1",
  experimentSlug: "exp1",
  branch: "exp1",
  parentBranch: "feature-x",
});

beforeEach(() => {
  tdd = mkdtempSync(join(tmpdir(), "tdd-envguard-"));
  proj = mkdtempSync(join(tmpdir(), "proj-envguard-"));
  createPairedBranch.mockReset();
  deletePairedBranch.mockReset();
});

afterEach(() => {
  rmSync(tdd, { recursive: true, force: true });
  rmSync(proj, { recursive: true, force: true });
});

describe("cutExperiment .env-sync guard (hermetic)", () => {
  it("throws when the paired cut did not populate .env (envSynced=false)", async () => {
    createPairedBranch.mockResolvedValue(
      pairedResult({ envSynced: false, warnings: [".env sync failed: endpoint timeout"] })
    );
    await expect(cutExperiment(cutArgs())).rejects.toThrow(/did not populate \.env/i);
    // And it carries the underlying warning so the failure is correctly attributed.
    await expect(cutExperiment(cutArgs())).rejects.toThrow(/endpoint timeout/);
  });

  it("does not write the on-disk experiment record when the sync was skipped", async () => {
    createPairedBranch.mockResolvedValue(pairedResult({ envSynced: false, warnings: [] }));
    await expect(cutExperiment(cutArgs())).rejects.toThrow();
    // No partial record: the dir/branch.txt are only written after the guard passes.
    expect(existsSync(join(experimentDir(tdd, "F1", "S1", "exp1"), "branch.txt"))).toBe(false);
  });

  it("proceeds and writes the record when .env was synced (envSynced=true)", async () => {
    createPairedBranch.mockResolvedValue(pairedResult({ envSynced: true }));
    const rec = await cutExperiment(cutArgs());
    expect(rec.branch_id).toBe("exp1");
    expect(existsSync(join(rec.dir, "branch.txt"))).toBe(true);
    expect(existsSync(join(rec.dir, "outcomes.json"))).toBe(true);
  });
});

// The git<->DB fork-parent agreement guard (the S3-cut-from-wrong-parent HIL halt):
// the paired cut forks Lakebase from parentBranch's tier, so the git experiment
// branch MUST also descend from the LOCAL parentBranch tip. A stale-origin git fork
// (git HEAD not descending from the local parent tip) would silently diverge from the
// DB and burn the whole regression-fix budget before halting to HIL. These use a REAL
// temp git repo so merge-base --is-ancestor runs for real.
describe("cutExperiment git<->DB fork-parent guard (real git)", () => {
  const git = (args: string[]) =>
    execFileSync("git", args, { cwd: proj, stdio: ["ignore", "pipe", "pipe"] });

  beforeEach(() => {
    createPairedBranch.mockResolvedValue(pairedResult({ envSynced: true }));
    git(["init", "-q", "-b", "main"]);
    git(["config", "user.email", "t@t.t"]);
    git(["config", "user.name", "t"]);
    writeFileSync(join(proj, "a.txt"), "1");
    git(["add", "-A"]);
    git(["commit", "-qm", "c1"]);
    // parentBranch = "feature-x" carries an accepted commit HEAD must descend from.
    git(["branch", "feature-x"]);
  });

  it("passes when HEAD descends from the local parent tip", async () => {
    // HEAD (main) IS feature-x's tip here -> ancestor holds.
    git(["checkout", "-q", "feature-x"]);
    const rec = await cutExperiment(cutArgs());
    expect(rec.branch_id).toBe("exp1");
    expect(existsSync(join(rec.dir, "branch.txt"))).toBe(true);
  });

  it("throws when HEAD does NOT descend from the local parent tip (the split-brain)", async () => {
    // Advance feature-x past HEAD, then leave HEAD on the OLD commit (main) -> the
    // local feature-x tip is no longer an ancestor of HEAD == the stale-origin mis-fork.
    git(["checkout", "-q", "feature-x"]);
    writeFileSync(join(proj, "a.txt"), "2");
    git(["commit", "-qam", "c2-on-feature-x"]);
    git(["checkout", "-q", "main"]); // HEAD = c1, behind feature-x's c2
    await expect(cutExperiment(cutArgs())).rejects.toThrow(/does NOT descend from the local "feature-x" tip/);
    // No partial record when the guard trips.
    expect(existsSync(join(experimentDir(tdd, "F1", "S1", "exp1"), "branch.txt"))).toBe(false);
  });

  it("skips the guard when the local parent ref is absent (nothing to compare)", async () => {
    // No local "feature-x" ref resolvable? Use a parentBranch that does not exist.
    createPairedBranch.mockResolvedValue(pairedResult({ envSynced: true }));
    const rec = await cutExperiment({ ...cutArgs(), parentBranch: "no-such-branch" });
    expect(rec.branch_id).toBe("exp1");
  });
});
