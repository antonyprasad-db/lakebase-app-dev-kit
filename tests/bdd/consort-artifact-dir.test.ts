// The artifact root (.consort) is resolved in one place with tri-read backward
// compat (.consort -> .sftdd -> .tdd, newest-first), and the newest legacy dir
// present is auto-migrated to ".consort" on the next orchestrated run. These
// guard both halves: resolution preference + migration.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  ARTIFACT_ROOT,
  LEGACY_ARTIFACT_ROOT,
  LEGACY_ARTIFACT_ROOTS,
  ALL_ARTIFACT_ROOTS,
  resolveConsortDir,
} from "../../consort/config/consort-paths";
import { migrateLegacyArtifactDir } from "../../consort/config/migrate-artifact-dir";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "consort-root-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("artifact root names", () => {
  it("uses .consort as the current root and .sftdd/.tdd as the legacy roots", () => {
    expect(ARTIFACT_ROOT).toBe(".consort");
    expect(LEGACY_ARTIFACT_ROOTS).toEqual([".sftdd", ".tdd"]);
    expect(LEGACY_ARTIFACT_ROOT).toBe(".sftdd");
    expect(ALL_ARTIFACT_ROOTS).toEqual([".consort", ".sftdd", ".tdd"]);
  });
});

describe("resolveConsortDir (tri-read, prefers .consort)", () => {
  it("defaults a fresh project to .consort", () => {
    expect(resolveConsortDir(dir)).toBe(join(dir, ".consort"));
  });

  it("honors a legacy .sftdd dir when that is what exists", () => {
    mkdirSync(join(dir, ".sftdd"));
    expect(resolveConsortDir(dir)).toBe(join(dir, ".sftdd"));
  });

  it("honors an older legacy .tdd dir when that is what exists", () => {
    mkdirSync(join(dir, ".tdd"));
    expect(resolveConsortDir(dir)).toBe(join(dir, ".tdd"));
  });

  it("prefers .consort over any legacy root when all exist", () => {
    mkdirSync(join(dir, ".tdd"));
    mkdirSync(join(dir, ".sftdd"));
    mkdirSync(join(dir, ".consort"));
    expect(resolveConsortDir(dir)).toBe(join(dir, ".consort"));
  });

  it("prefers the newer .sftdd over the older .tdd when both legacy roots exist", () => {
    mkdirSync(join(dir, ".tdd"));
    mkdirSync(join(dir, ".sftdd"));
    expect(resolveConsortDir(dir)).toBe(join(dir, ".sftdd"));
  });
});

describe("migrateLegacyArtifactDir (auto-migrate newest legacy root -> .consort)", () => {
  it("is a no-op when there is no legacy root", () => {
    const r = migrateLegacyArtifactDir(dir);
    expect(r.migrated).toBe(false);
    expect(existsSync(join(dir, ".consort"))).toBe(false);
  });

  it("renames a legacy .sftdd to .consort via fs when not a git repo", () => {
    mkdirSync(join(dir, ".sftdd"));
    writeFileSync(join(dir, ".sftdd", "spec.json"), "{}\n", "utf8");
    const r = migrateLegacyArtifactDir(dir);
    expect(r.migrated).toBe(true);
    expect(r.via).toBe("fs");
    expect(existsSync(join(dir, ".sftdd"))).toBe(false);
    expect(readFileSync(join(dir, ".consort", "spec.json"), "utf8")).toBe("{}\n");
  });

  it("renames an older legacy .tdd to .consort when .sftdd is absent", () => {
    mkdirSync(join(dir, ".tdd"));
    writeFileSync(join(dir, ".tdd", "spec.json"), "{}\n", "utf8");
    const r = migrateLegacyArtifactDir(dir);
    expect(r.migrated).toBe(true);
    expect(existsSync(join(dir, ".tdd"))).toBe(false);
    expect(readFileSync(join(dir, ".consort", "spec.json"), "utf8")).toBe("{}\n");
  });

  it("migrates the NEWER .sftdd when both legacy roots exist (leaves .tdd)", () => {
    mkdirSync(join(dir, ".tdd"));
    writeFileSync(join(dir, ".tdd", "old.json"), "old\n", "utf8");
    mkdirSync(join(dir, ".sftdd"));
    writeFileSync(join(dir, ".sftdd", "new.json"), "new\n", "utf8");
    const r = migrateLegacyArtifactDir(dir);
    expect(r.migrated).toBe(true);
    expect(readFileSync(join(dir, ".consort", "new.json"), "utf8")).toBe("new\n");
    // The older .tdd is untouched (only the newest legacy root migrates).
    expect(existsSync(join(dir, ".tdd"))).toBe(true);
  });

  it("preserves git history with git mv inside a git repo", () => {
    execFileSync("git", ["init", "-q"], { cwd: dir });
    execFileSync("git", ["config", "user.email", "t@example.com"], { cwd: dir });
    execFileSync("git", ["config", "user.name", "t"], { cwd: dir });
    mkdirSync(join(dir, ".sftdd"));
    writeFileSync(join(dir, ".sftdd", "spec.json"), "{}\n", "utf8");
    execFileSync("git", ["add", "-A"], { cwd: dir });
    execFileSync("git", ["commit", "-qm", "seed"], { cwd: dir });

    const r = migrateLegacyArtifactDir(dir);
    expect(r.migrated).toBe(true);
    expect(r.via).toBe("git");
    expect(existsSync(join(dir, ".consort", "spec.json"))).toBe(true);
    // git sees a rename (staged), not an add+delete of unrelated files.
    const staged = execFileSync("git", ["status", "--porcelain"], { cwd: dir, encoding: "utf8" });
    expect(staged).toMatch(/R.*\.sftdd\/spec\.json.*\.consort\/spec\.json/);
  });

  it("rewrites .gitignore entries from a legacy root to the new one", () => {
    mkdirSync(join(dir, ".sftdd"));
    writeFileSync(
      join(dir, ".gitignore"),
      "node_modules/\n.sftdd/agent-log.jsonl\n.sftdd/run-config.json\ndist/\n",
      "utf8",
    );
    migrateLegacyArtifactDir(dir);
    const gi = readFileSync(join(dir, ".gitignore"), "utf8");
    expect(gi).toContain(".consort/agent-log.jsonl");
    expect(gi).toContain(".consort/run-config.json");
    expect(gi).not.toMatch(/^\.sftdd\//m);
    expect(gi).toContain("node_modules/");
    expect(gi).toContain("dist/");
  });

  it("is a no-op (does not clobber) when .consort already exists", () => {
    mkdirSync(join(dir, ".sftdd"));
    mkdirSync(join(dir, ".consort"));
    writeFileSync(join(dir, ".consort", "keep.json"), "keep\n", "utf8");
    const r = migrateLegacyArtifactDir(dir);
    expect(r.migrated).toBe(false);
    expect(existsSync(join(dir, ".sftdd"))).toBe(true);
    expect(readFileSync(join(dir, ".consort", "keep.json"), "utf8")).toBe("keep\n");
  });
});
