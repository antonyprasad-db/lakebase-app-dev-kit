// The live-step-visibility contract, as a runnable proof. The orchestrator relays a
// backgrounded drive by looping poll-once `consort-watch --since <cursor>`: each call
// returns the NEW transitions since the cursor and a status, so the human watches the
// design lane unfold turn by turn (never a blocking watch, which buffers to a spinner).
// This test drives the SAME pollOnce the CLI uses against a growing log and asserts each
// step surfaces as it lands + the gate is detected + a late attach still reports the
// real stop. Run: `npx vitest run tests/bdd/consort-watch-relay.test.ts`.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pollOnce, scanLastStop } from "../../bin/consort/watch.cli";

describe("consort-watch poll-once = live step visibility in the session", () => {
  let dir: string;
  let log: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "watch-relay-"));
    log = join(dir, "drive-live.log");
    writeFileSync(log, "");
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("surfaces EACH design-lane role transition as it lands, then the spec gate", () => {
    // The design lane, one line appended per "turn" (as a real detached drive writes it).
    const steps: Array<[string, string]> = [
      ["[sprint] feature 1: F1-stock-visibility", "feature 1: F1-stock-visibility"],
      ["[drive] 000 dispatch spec-author for breakdown", "dispatch spec-author for breakdown"],
      ["[drive] spec-author turn 87.2s (haiku)", "spec-author turn 87.2s"],
      ["[drive] 001 dispatch ux-designer for design", "dispatch ux-designer for design"],
      ["[drive] ux-designer turn 101.3s (opus)", "ux-designer turn 101.3s"],
      ["[drive] 002 dispatch architect-reviewer for design", "dispatch architect-reviewer for design"],
      ["[drive] 003 dispatch dba for design", "dispatch dba for design"],
      ["[drive] 004 dispatch test-strategist for design", "dispatch test-strategist for design"],
    ];
    let cursor = 0;
    for (const [raw, expected] of steps) {
      appendFileSync(log, raw + "\n");
      const r = pollOnce(log, cursor);
      // The NEW step shows on THIS poll (live), the cursor advances, run still going.
      expect(r.relayed.join("\n"), `poll after "${raw}"`).toContain(expected);
      expect(r.cursor).toBeGreaterThan(cursor);
      expect(r.status).toBe("running");
      cursor = r.cursor;
    }
    // The spec gate lands -> the poll that reads it reports status=gate + the marker.
    appendFileSync(log, "[drive] GATE awaiting human approval: approve the S1-file-stock spec gate.\n");
    const g = pollOnce(log, cursor);
    expect(g.status).toBe("gate");
    expect(g.relayed.join("\n")).toContain("GATE awaiting human approval");
  });

  it("each poll shows ONLY the new lines since the cursor (no re-relay, no spinner)", () => {
    appendFileSync(log, "[drive] 000 dispatch spec-author for breakdown\n");
    const a = pollOnce(log, 0);
    expect(a.relayed.some((l) => l.includes("spec-author"))).toBe(true);
    const b = pollOnce(log, a.cursor); // nothing new since the cursor
    expect(b.relayed).toEqual([]);
    expect(b.status).toBe("running");
  });

  it("LATE attach: drive already PAUSED + pid gone => reports the real stop, not a false done/unclean", () => {
    appendFileSync(
      log,
      "[drive] 000 dispatch spec-author for breakdown\n" +
        "[drive] PAUSED , awaiting the Product Owner's sprint backlog.\n",
    );
    const first = pollOnce(log, 0); // reads everything; the batch itself catches the pause
    expect(first.status).toBe("pause");
    // Re-attach AFTER the marker (cursor at EOF), drive pid gone: the missed-marker path.
    const late = pollOnce(log, first.cursor, 4242, () => false);
    expect(late.status).toBe("pause"); // scanLastStop found it , NOT a blind "done"/exit-3
  });

  it("scanLastStop returns the LAST stop of any kind in the log", () => {
    appendFileSync(log, "[drive] GATE awaiting human approval: x\n[drive] PAUSED , awaiting input\n");
    expect(scanLastStop(log)?.outcome).toBe("pause");
    writeFileSync(log, "[drive] 000 dispatch spec-author for breakdown\n"); // no stop line
    expect(scanLastStop(log)).toBeNull();
  });
});
