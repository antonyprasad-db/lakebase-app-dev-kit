#!/usr/bin/env node
type WatchLineKind = "dispatch" | "turn-done" | "feature" | "skip" | "gate" | "pause" | "escalation" | "done" | "stalled" | "notice" | "info";
interface WatchClass {
    kind: WatchLineKind;
    /** The line to show the human, with the `[drive] NNN ` bookkeeping trimmed. */
    text: string;
    /** STOP tailing after emitting this line (control has returned to the human). */
    stop: boolean;
    /** Terminal disposition, set when `stop` — drives the watcher's exit code. */
    outcome?: "gate" | "pause" | "done" | "escalation";
}

/** Read the WHOLE log and return the LAST classified STOP line (gate/pause/escalation/
 *  done), or null if none. Used when the drive already reached a terminal marker before
 *  (or just as) we attached , a fast detached run that stopped before this follow
 *  started from EOF. Without it we'd miss the marker and falsely report an unclean exit.
 *  Works for ANY step (it matches whatever the classifier flags as a stop). */
declare function scanLastStop(logPath: string): WatchClass | null;
/** The AUTHORITATIVE stop signal: `.consort/next.json`, which the drive writes on EVERY
 *  stop (a gate, the planning backlog pause, accept/discard/revise, done, or an escalation)
 *  and NEVER while running. Read directly (no derive) so the persistent monitor can alert
 *  the INSTANT the drive stops, WITHOUT waiting on a `[drive]` marker the transient
 *  drive-live.log may never carry , the sit-at-gate bug. `generated_at` is stamped fresh on
 *  each stop, so a change since the monitor attached means a NEW stop (not the stale prior
 *  one). `awaiting_human` is the sole human-needed signal (mirrors consort-next). Returns
 *  null when next.json is absent/unreadable (the drive has not stopped yet). */
interface NextStop {
    generated_at: string;
    awaiting_human: boolean;
    done: boolean;
    escalated: boolean;
    summary: string;
    hil?: string;
    enact?: string;
}
declare function readNextStop(consortDir: string): NextStop | null;
type PollStatus = "running" | "gate" | "pause" | "escalation" | "done" | "waiting";
interface PollResult {
    /** The lines a human sees this poll, already PREFIX-formatted (role/gate/etc.). */
    relayed: string[];
    /** New byte offset , pass as the next `--since`. */
    cursor: number;
    /** running until a stop is seen (this batch OR, when the pid is gone, anywhere in the log). */
    status: PollStatus;
    /** MEASURED liveness, never inferred: ms since the log's last write (now - mtime). A long
     *  silent stretch is a slow OR a hung turn , the log ALONE CANNOT tell which (one model
     *  call writes nothing until it returns), so the caller RELAYS this number and must NOT
     *  invent a "hung" / "stuck N min" verdict from it. The only authoritative stall signal is
     *  the drive's own `[drive] turn stalled:` line (emitted by the in-process inactivity
     *  monitor after real silence), which classifies as kind `stalled`. */
    silentMs: number;
    /** MEASURED: is the drive pid alive? `null` when no pid was supplied (unknown, never guessed). */
    pidAlive: boolean | null;
}
/** POLL-ONCE, pure + testable (no stdout): read new lines from `since` to EOF, format
 *  each meaningful transition for relay, and resolve the status. This is the ONE relay
 *  the guidance mandates , the caller loops it (narrating `relayed` each time) until
 *  `status` is a stop. `isAlive` is injectable so a test can drive the pid-gone path;
 *  `nowMs` is injectable so a test can drive the measured-silence path deterministically.
 *  Also returns MEASURED liveness (`silentMs`, `pidAlive`) so the caller relays real
 *  numbers and never has to guess how long a quiet turn has been running. */
declare function pollOnce(logPath: string, since: number, pid?: number, isAlive?: (p: number) => boolean, nowMs?: number): PollResult;

export { type PollResult, type PollStatus, pollOnce, readNextStop, scanLastStop };
