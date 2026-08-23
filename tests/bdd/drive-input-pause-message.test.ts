// The planning `author-requests` pause message must reflect DISK STATE, not a
// fixed script. A staged first-project (and any prior propose turn) already has
// feature-request.md files, so telling the human to "author the sprint's
// feature-requests" there is the misread that makes /sprint look like the
// orchestrator is confused. composeInputPause branches: author-then-commit when
// nothing exists; COMMIT-only (naming the exact sync-backlog command, pre-filled
// from the Spec Author's proposals) when requests already exist.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { featureRequestMd, featureProposalsMd } from "../../consort/config/consort-paths.js";
import { composeInputPause } from "../../bin/consort/drive.cli.js";
import type { WorkflowAction } from "../../consort/orchestrator/workflow/workflow-vocabulary.js";

const ACTION: WorkflowAction = { kind: "invoke-role", role: "product-owner", mode: "author-requests" };
const AUTHOR_PHRASE = "author the sprint's feature-request(s)";

let tdd: string;
beforeEach(() => {
  tdd = mkdtempSync(join(tmpdir(), "inputpause-"));
});
afterEach(() => {
  rmSync(tdd, { recursive: true, force: true });
});

function authorRequest(id: string): void {
  const f = featureRequestMd(tdd, id);
  mkdirSync(join(f, ".."), { recursive: true });
  writeFileSync(f, `# ${id}\n\nAs a user I want ${id}.\n`);
}

function writeProposals(...ids: string[]): void {
  const p = featureProposalsMd(tdd);
  mkdirSync(join(p, ".."), { recursive: true });
  writeFileSync(p, `# candidates\n\n${ids.map((i) => `## ${i}\n`).join("\n")}`);
}

describe("composeInputPause , the planning author-requests pause", () => {
  it("never reads as approved/complete (nothing produced yet)", () => {
    expect(composeInputPause(ACTION, "s1", tdd)).toContain("PAUSED");
  });

  it("NO feature-request.md yet => tells the PO to AUTHOR, then commit", () => {
    const msg = composeInputPause(ACTION, "s1", tdd);
    expect(msg).toContain("No feature-request.md exists yet");
    expect(msg).toContain(AUTHOR_PHRASE);
    expect(msg).toContain("consort-sync-backlog --sprint s1");
  });

  it("requests already staged => a COMMIT decision, NOT an authoring task", () => {
    authorRequest("F1-stock-visibility");
    authorRequest("F2-stock-adjustment");
    const msg = composeInputPause(ACTION, "s1", tdd);
    expect(msg).toContain("DECISION, not an authoring task");
    expect(msg).toContain("already authored");
    expect(msg).toContain("F1-stock-visibility");
    expect(msg).toContain("F2-stock-adjustment");
    // The whole point: do NOT tell the human to author requests that exist.
    expect(msg).not.toContain(AUTHOR_PHRASE);
    // Names the exact commit command.
    expect(msg).toContain("consort-sync-backlog --sprint s1 --features F1-stock-visibility,F2-stock-adjustment");
  });

  it("pre-fills --features from the Spec Author's proposals, not all authored ids", () => {
    authorRequest("F1-stock-visibility");
    authorRequest("F2-stock-adjustment");
    authorRequest("F3-inbound-receipt"); // authored but NOT proposed for this sprint
    writeProposals("F1-stock-visibility", "F2-stock-adjustment");
    const msg = composeInputPause(ACTION, "s1", tdd);
    expect(msg).toContain("Planning proposed for this sprint: F1-stock-visibility, F2-stock-adjustment");
    expect(msg).toContain("--features F1-stock-visibility,F2-stock-adjustment");
    // F3 is authored but not proposed, so it must not be pre-filled into the commit.
    expect(msg).not.toContain("F2-stock-adjustment,F3-inbound-receipt");
  });

  it("no consortDir (single-feature driver path) => falls back to the author message", () => {
    const msg = composeInputPause(ACTION);
    expect(msg).toContain(AUTHOR_PHRASE);
  });
});
