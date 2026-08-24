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
type PollStatus = "running" | "gate" | "pause" | "escalation" | "done" | "waiting";
interface PollResult {
    /** The lines a human sees this poll, already PREFIX-formatted (role/gate/etc.). */
    relayed: string[];
    /** New byte offset , pass as the next `--since`. */
    cursor: number;
    /** running until a stop is seen (this batch OR, when the pid is gone, anywhere in the log). */
    status: PollStatus;
}
/** POLL-ONCE, pure + testable (no stdout): read new lines from `since` to EOF, format
 *  each meaningful transition for relay, and resolve the status. This is the ONE relay
 *  the guidance mandates , the caller loops it (narrating `relayed` each time) until
 *  `status` is a stop. `isAlive` is injectable so a test can drive the pid-gone path. */
declare function pollOnce(logPath: string, since: number, pid?: number, isAlive?: (p: number) => boolean): PollResult;

export { type PollResult, type PollStatus, pollOnce, scanLastStop };
