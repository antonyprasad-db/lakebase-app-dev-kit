// P2b optimize-snapshot: the snapshot/restore primitive at a turn boundary, so
// each candidate for one handoff runs from an IDENTICAL pre-turn state.
//   - DESIGN turns are .sftdd-only (pure artifact): snapshot copies the .sftdd
//     tree; restore replaces it wholesale. No git, no cloud.
//   - BUILD turns are 3-part (git commit + paired Lakebase branch + branch DB
//     rows): snapshot captures the pre-turn SHA; restore resets the tree to it and
//     (only for GREEN/REFACTOR, which mutate the DB) re-forks a clean paired branch.
//     All git + re-fork ops are INJECTED, so this module is unit-tested with no
//     git repo and no cloud.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  snapshotDesign,
  snapshotBuild,
  type BuildSnapshotDeps,
} from "../../scripts/sftdd/optimize-snapshot";

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "optimize-snap-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("snapshotDesign: .sftdd copy/replace round-trip", () => {
  it("restores the .sftdd tree byte-for-byte after a mutation", () => {
    const sftddDir = join(root, ".sftdd");
    mkdirSync(join(sftddDir, "features", "F1"), { recursive: true });
    writeFileSync(join(sftddDir, "features", "F1", "spec.md"), "ORIGINAL\n");

    const snap = snapshotDesign({ sftddDir });
    // A candidate turn dirties the artifact tree...
    writeFileSync(join(sftddDir, "features", "F1", "spec.md"), "CANDIDATE MUTATION\n");
    writeFileSync(join(sftddDir, "features", "F1", "extra.md"), "stray file\n");

    snap.restore();

    expect(readFileSync(join(sftddDir, "features", "F1", "spec.md"), "utf8")).toBe("ORIGINAL\n");
    // A file the candidate ADDED is gone after restore (wholesale replace).
    expect(existsSync(join(sftddDir, "features", "F1", "extra.md"))).toBe(false);
  });

  it("restore is idempotent (can restore twice, same result)", () => {
    const sftddDir = join(root, ".sftdd");
    mkdirSync(sftddDir, { recursive: true });
    writeFileSync(join(sftddDir, "a.txt"), "A\n");
    const snap = snapshotDesign({ sftddDir });
    writeFileSync(join(sftddDir, "a.txt"), "B\n");
    snap.restore();
    snap.restore();
    expect(readFileSync(join(sftddDir, "a.txt"), "utf8")).toBe("A\n");
  });

  it("dispose removes the backing copy without touching the live tree", () => {
    const sftddDir = join(root, ".sftdd");
    mkdirSync(sftddDir, { recursive: true });
    writeFileSync(join(sftddDir, "a.txt"), "A\n");
    const snap = snapshotDesign({ sftddDir });
    snap.dispose();
    expect(existsSync(join(sftddDir, "a.txt"))).toBe(true);
  });
});

describe("snapshotBuild: SHA reset + conditional re-fork (injected substrate)", () => {
  function recordingDeps(sha = "abc123"): { deps: BuildSnapshotDeps; calls: string[] } {
    const calls: string[] = [];
    return {
      calls,
      deps: {
        captureSha: async () => {
          calls.push("captureSha");
          return sha;
        },
        resetHard: async (s) => {
          calls.push(`resetHard:${s}`);
        },
        reFork: async () => {
          calls.push("reFork");
        },
      },
    };
  }

  it("captures the pre-turn SHA at snapshot time", async () => {
    const { deps, calls } = recordingDeps("deadbeef");
    const snap = await snapshotBuild({ projectDir: root, sftddDir: join(root, ".sftdd"), story: "S1" }, deps);
    expect(calls).toEqual(["captureSha"]);
    expect(snap.sha).toBe("deadbeef");
  });

  it("RED/REVIEW restore resets to the SHA but does NOT re-fork (no DB mutation)", async () => {
    const { deps, calls } = recordingDeps();
    const snap = await snapshotBuild({ projectDir: root, sftddDir: join(root, ".sftdd"), story: "S1" }, deps);
    await snap.restore({ reFork: false });
    expect(calls).toEqual(["captureSha", "resetHard:abc123"]);
    expect(calls).not.toContain("reFork");
  });

  it("GREEN/REFACTOR restore resets to the SHA AND re-forks a clean paired branch", async () => {
    const { deps, calls } = recordingDeps();
    const snap = await snapshotBuild({ projectDir: root, sftddDir: join(root, ".sftdd"), story: "S1" }, deps);
    await snap.restore({ reFork: true });
    expect(calls).toEqual(["captureSha", "resetHard:abc123", "reFork"]);
  });

  it("restore can run repeatedly (once per candidate) from the same snapshot", async () => {
    const { deps, calls } = recordingDeps();
    const snap = await snapshotBuild({ projectDir: root, sftddDir: join(root, ".sftdd"), story: "S1" }, deps);
    await snap.restore({ reFork: true });
    await snap.restore({ reFork: true });
    expect(calls.filter((c) => c === "reFork")).toHaveLength(2);
    expect(calls.filter((c) => c === "resetHard:abc123")).toHaveLength(2);
  });
});
