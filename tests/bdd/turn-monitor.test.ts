// turn-monitor: the liveness/timeout capability for a step's dispatch-agent phase. It does
// NOT own a stream or a child process , it is a small, pure state machine over an injected
// clock, so it is unit-tested with no spawn. The real wiring (feed it spawnClaudeStreaming's
// per-line events; map its timeout to a transient ClaudeTurnError) is Slice 3. Here we pin
// the controller: it emits progress, fires a heartbeat after inactivity, and fires a timeout
// after the hard deadline , and is a total no-op when no monitor is supplied (the
// byte-identical default).

import { describe, it, expect, vi } from "vitest";
import { createMonitorController } from "../../consort/orchestrator/turns/turn-monitor";
import type { TurnMonitor, TurnProgress, MonitorClock } from "../../consort/orchestrator/turns/turn-monitor";

/** A fake clock: manual `now`, and timers we fire explicitly by advancing time. */
function fakeClock() {
  let now = 0;
  const timers = new Map<number, { fireAt: number; fn: () => void }>();
  let nextId = 1;
  const clock: MonitorClock = {
    now: () => now,
    setTimer: (fn, ms) => {
      const id = nextId++;
      timers.set(id, { fireAt: now + ms, fn });
      return id as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimer: (t) => {
      timers.delete(t as unknown as number);
    },
  };
  /** Advance the clock, firing every timer whose deadline is now reached (re-armed timers
   *  scheduled during firing are honored on subsequent passes). */
  function advance(ms: number) {
    const target = now + ms;
    // Fire in deadline order until none remain due, so a re-armed heartbeat can fire again.
    for (;;) {
      const due = [...timers.entries()].filter(([, t]) => t.fireAt <= target).sort((a, b) => a[1].fireAt - b[1].fireAt);
      if (due.length === 0) break;
      const [id, t] = due[0];
      timers.delete(id);
      now = t.fireAt;
      t.fn();
    }
    now = target;
  }
  return { clock, advance };
}

describe("turn-monitor controller", () => {
  it("is a total no-op when no monitor is supplied (byte-identical default)", () => {
    const { clock, advance } = fakeClock();
    const onTimeout = vi.fn();
    const ctl = createMonitorController(undefined, onTimeout, clock);
    ctl.start();
    ctl.progress({ kind: "tool", tool: "Edit" });
    advance(10_000);
    ctl.stop();
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it("emits start/progress/end events to onProgress with a timestamp", () => {
    const { clock } = fakeClock();
    const seen: TurnProgress[] = [];
    const monitor: TurnMonitor = { onProgress: (p) => seen.push(p) };
    const ctl = createMonitorController(monitor, vi.fn(), clock);
    ctl.start();
    ctl.progress({ kind: "tool", tool: "Write" });
    ctl.stop();
    expect(seen.map((p) => p.kind)).toEqual(["start", "tool", "end"]);
    expect(seen[1].tool).toBe("Write");
    expect(typeof seen[0].atMs).toBe("number");
  });

  it("fires a heartbeat when no progress arrives within heartbeatMs, then re-arms", () => {
    const { clock, advance } = fakeClock();
    const seen: TurnProgress[] = [];
    const monitor: TurnMonitor = { onProgress: (p) => seen.push(p), heartbeatMs: 1000 };
    const ctl = createMonitorController(monitor, vi.fn(), clock);
    ctl.start();
    advance(1000); // first heartbeat
    advance(1000); // second (re-armed)
    ctl.stop();
    const beats = seen.filter((p) => p.kind === "heartbeat");
    expect(beats.length).toBe(2);
  });

  it("a progress event RESETS the heartbeat timer (no beat if activity keeps arriving)", () => {
    const { clock, advance } = fakeClock();
    const seen: TurnProgress[] = [];
    const monitor: TurnMonitor = { onProgress: (p) => seen.push(p), heartbeatMs: 1000 };
    const ctl = createMonitorController(monitor, vi.fn(), clock);
    ctl.start();
    advance(600);
    ctl.progress({ kind: "tool", tool: "Bash" }); // resets heartbeat
    advance(600); // 1200ms since start but only 600ms since last activity => no beat yet
    ctl.stop();
    expect(seen.filter((p) => p.kind === "heartbeat")).toHaveLength(0);
  });

  it("fires onTimeout once after timeoutMs (a hung turn) and stops beating", () => {
    const { clock, advance } = fakeClock();
    const onTimeout = vi.fn();
    const monitor: TurnMonitor = { heartbeatMs: 1000, timeoutMs: 5000 };
    const ctl = createMonitorController(monitor, onTimeout, clock);
    ctl.start();
    advance(5000);
    expect(onTimeout).toHaveBeenCalledTimes(1);
    // After a timeout, stop() must be safe + not re-fire.
    ctl.stop();
    advance(5000);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it("stop() clears pending timers so no heartbeat/timeout fires afterward", () => {
    const { clock, advance } = fakeClock();
    const onTimeout = vi.fn();
    const seen: TurnProgress[] = [];
    const monitor: TurnMonitor = { onProgress: (p) => seen.push(p), heartbeatMs: 1000, timeoutMs: 5000 };
    const ctl = createMonitorController(monitor, onTimeout, clock);
    ctl.start();
    ctl.stop();
    advance(10_000);
    expect(onTimeout).not.toHaveBeenCalled();
    expect(seen.filter((p) => p.kind === "heartbeat")).toHaveLength(0);
  });
});
